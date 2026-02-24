const App = {
    userMember: null, // This acts as our "Global State"

    async init() {
        try {
            // Load theme preference from localStorage, or use system preference
            let savedTheme = localStorage.getItem('theme');
            
            if (!savedTheme) {
                // Check device/browser preference if no saved preference exists
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                savedTheme = prefersDark ? 'dark' : 'light';
            }
            
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                document.getElementById('theme-toggle').textContent = '☀️';
            }

            const urlParams = new URLSearchParams(window.location.search);

            // If a previous linking flow stored a session secret, apply it before initializing
            try {
                const linkedSessionSecret = localStorage.getItem('LINKED_SESSION_SECRET');
                if (linkedSessionSecret) {
                    console.info('Found linked session secret, applying...');
                    let applied = false;
                    for (let i = 0; i < 5 && !applied; i++) {
                        try {
                            await client.setJWT(linkedSessionSecret);
                            applied = true;
                            console.info('Applied linked session secret');
                        } catch (e) {
                            console.warn('Failed to apply session secret, retrying...', e);
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                }
            } catch (e) {
                console.debug('Error applying linked session secret', e);
            }

            // If a previous flow stored a fallback JWT (due to SDK race), try to apply it now.
            try {
                const fallbackJwt = localStorage.getItem('APPWRITE_JWT_FALLBACK');
                if (fallbackJwt) {
                    // Retry setting JWT a few times in case BroadcastChannel/EventTarget still initializing
                    let applied = false;
                    for (let i = 0; i < 5 && !applied; i++) {
                        try {
                            await client.setJWT(fallbackJwt);
                            applied = true;
                            localStorage.removeItem('APPWRITE_JWT_FALLBACK');
                            console.info('Applied fallback JWT from localStorage');
                        } catch (e) {
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                }
            } catch (e) {
                console.debug('Error applying fallback JWT', e);
            }
            const claimId = urlParams.get('claim');
            const claimToken = urlParams.get('claim_token');

            // 1. Get/Create Session
            const sessionUser = await Auth.initSession();

            // 2a. If we have a server-backed claim_token, exchange it for a JWT via Cloud Function
            if (claimToken) {
                try {
                    const exec = await functions.createExecution(CLAIM_FUNCTION_ID, JSON.stringify({ token: claimToken, scannerUid: sessionUser.$id }));

                    // Helpful debug: log execution id and snapshot of likely payload fields so we can inspect what was sent
                    console.info('Created claim exchange execution id:', exec.$id);
                    try {
                        console.debug('Execution snapshot:', {
                            id: exec.$id,
                            status: exec.status,
                            payload: exec.payload || exec.requestPayload || exec.data || exec.args || null,
                            // include raw exec for manual inspection in console (non-stringified)
                            raw: exec
                        });
                    } catch (e) {
                        console.debug('Execution object (raw):', exec);
                    }

                    // Poll for execution completion (timeout after ~45s to allow slower runtimes)
                    const start = Date.now();
                    let check = exec;
                    const TIMEOUT_MS = 45000; // increased from 15s
                    const POLL_MS = 1000; // poll every 1s
                    while ((check.status !== 'completed') && (Date.now() - start < TIMEOUT_MS)) {
                        await new Promise(r => setTimeout(r, POLL_MS));
                        check = await functions.getExecution(CLAIM_FUNCTION_ID, exec.$id);
                        // Log status and snapshot of likely response/log fields for debugging
                        try {
                            console.debug('Claim execution status snapshot:', {
                                id: check.$id || exec.$id,
                                status: check.status,
                                response: check.response || null,
                                stdout: check.stdout || check.output || null,
                                logs: check.logs || null,
                                raw: check
                            });
                        } catch (e) {
                            console.debug('Execution check (raw):', check);
                        }
                    }

                    // Provide clearer diagnostics to the user and logs for troubleshooting
                    if (check.status === 'completed') {
                        // Primary: function response provided directly
                        let parsed = null;
                        let rawResponse = check.response;

                        // Fallback: some runtimes write to stdout/logs. Try known fields.
                        if (!rawResponse) {
                            const candidates = [check.response, check.responseBody, check.responseText, check.stdout, check.output, check.logs, check.responseOutput, check.stdoutLogs];
                            for (const c of candidates) {
                                if (!c) continue;
                                const s = (typeof c === 'string') ? c : JSON.stringify(c);
                                // Look for our marker first
                                const m = /FUNCTION_RESPONSE\s*(\{[\s\S]*\})/.exec(s);
                                if (m && m[1]) {
                                    rawResponse = m[1];
                                    break;
                                }
                                // If entire string is JSON, try that too
                                try {
                                    JSON.parse(s);
                                    rawResponse = s;
                                    break;
                                } catch (e) {
                                    // not JSON, continue
                                }
                            }
                        }

                        if (rawResponse) {
                            try {
                                parsed = JSON.parse(rawResponse);
                            } catch (parseErr) {
                                console.error('Failed to parse claim function raw response:', rawResponse, parseErr, 'Full execution:', check);
                                alert('Claim exchange failed: invalid function response. See console for details.');
                            }
                        } else {
                            console.warn('Claim execution completed with no response object', check);
                            // Some runtimes write output to logs only; try to detect whether the scanner was linked by
                            // checking the member record for this session UID. If found, reload to continue as linked.
                            try {
                                const member = await DB.getMemberByUid(sessionUser.$id);
                                if (member) {
                                    console.info('Member found after claim execution (no direct response). Reloading.');
                                    window.location.href = window.location.pathname;
                                    return;
                                }
                            } catch (dbCheckErr) {
                                console.debug('DB check after claim execution failed', dbCheckErr);
                            }
                            alert('Claim exchange failed: no response from function. Check function logs.');
                        }

                        if (parsed) {
                            // Robust JWT extraction from various function response shapes
                            const findJwt = (obj) => {
                                if (!obj) return null;
                                if (typeof obj === 'string') return null;
                                // Try direct jwt field first
                                if (obj.jwt && typeof obj.jwt === 'string') return obj.jwt;
                                if (obj.token && typeof obj.token === 'string') return obj.token;
                                // Try nested structures
                                if (obj.data && obj.data.jwt) return obj.data.jwt;
                                if (obj.body && obj.body.jwt) return obj.body.jwt;
                                if (obj.response && obj.response.jwt) return obj.response.jwt;
                                if (obj.result && obj.result.jwt) return obj.result.jwt;
                                // If parsed looks like our function response body directly, try it
                                if (obj.linked && obj.jwt) return obj.jwt;
                                return null;
                            };

                            const jwt = findJwt(parsed);
                            console.info('Claim exchange response:', { parsed, extractedJwt: jwt ? (typeof jwt === 'string' ? '***' : { sessionId: '***', sessionSecret: '***' }) : null });
                            
                            if (parsed.linked && parsed.appwrite_uid) {
                                // Device successfully linked on server
                                console.info('Device linked to appwrite_uid:', parsed.appwrite_uid);
                                // Store the linked UID for the app to recognize on reload
                                localStorage.setItem('LINKED_APPWRITE_UID', parsed.appwrite_uid);
                                localStorage.setItem('LINKED_MEMBER_ID', parsed.memberId);
                                
                                // If we got a session secret, store it so the app can set it on reload
                                if (jwt && typeof jwt === 'object' && jwt.sessionSecret) {
                                    console.info('Storing session secret for next session');
                                    localStorage.setItem('LINKED_SESSION_SECRET', jwt.sessionSecret);
                                }
                                
                                alert('✓ Device successfully linked to member! Click OK to reload.');
                                await new Promise(r => setTimeout(r, 200));
                                window.location.href = window.location.pathname;
                                return;
                            }

                            console.warn('Claim exchange completed but no jwt returned:', parsed);
                            alert('Claim exchange failed: ' + (parsed?.error || 'no jwt returned'));
                        }
                    } else {
                        console.error('Claim execution did not complete in time:', check);
                        // Show execution id so user can inspect Appwrite logs
                        alert('Claim exchange timed out or failed. Execution id: ' + (exec.$id || 'unknown') + '. Check function logs for details.');
                    }
                } catch (e) {
                    console.error('Claim exchange error:', e);
                    alert('Claim exchange failed. See console for details.');
                }
            }

            // 2b. Legacy/simple claim flow (links like ?claim=MEMBER_ID)
            if (claimId) {
                await Auth.claimIdentity(claimId);
                // Clean URL and reload to finalize the link
                window.location.href = window.location.pathname;
                return; 
            }

            // 3. Fetch the Member Record from DB
            // We SAVE it to 'this.userMember' so the buttons can see it later
            this.userMember = await DB.getMemberByUid(sessionUser.$id);

            if (this.userMember) {
                this.renderDashboard();
            } else {
                document.getElementById('app').innerHTML = `
                    <div style="max-width: 600px; margin: 60px auto; text-align: center; padding: 20px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">🔒</div>
                        <h1 style="margin: 20px 0; color: var(--text);">Private Coffee Machine</h1>
                        <div style="background: var(--card); border-left: 4px solid var(--primary); padding: 20px; border-radius: 8px; margin: 30px 0; text-align: left;">
                            <p style="margin: 10px 0; color: var(--text);">This coffee machine is privately owned and maintained by a group of colleagues. Please do not use this machine unless you are an authorized member of our group.</p>
                            <p style="margin: 10px 0; color: var(--text); font-weight: 500;">Your device ID: <code style="background: var(--bg); padding: 2px 6px; border-radius: 3px;">${sessionUser.$id}</code></p>
                        </div>
                        <div style="background: var(--bg); padding: 20px; border-radius: 8px; margin: 30px 0;">
                            <p style="margin: 10px 0; color: var(--text); font-size: 0.95rem;">If you would like to request access to use this coffee machine, please contact:</p>
                            <p style="margin: 15px 0;"><a href="mailto:vismd@proton.me" style="font-size: 1.1rem; color: var(--primary); text-decoration: none; font-weight: 500;">vismd@proton.me</a></p>
                            <p style="margin: 10px 0; color: var(--secondary); font-size: 0.85rem;">We'd be happy to discuss membership!</p>
                        </div>
                    </div>`;
            }
        } catch (error) {
            console.error("Init Error:", error);
        }
    },

    async renderDashboard() {
        const app = document.getElementById('app');
        
        // Get dynamic coffee price
        const config = await DB.getGlobalConfig();
        
        // Render personal UI with dynamic price and surcharge percent
        app.innerHTML = UI.renderUserStats(this.userMember, config.coffee_price_per_cup, config.surcharge_percent);

        // Show a compact collective pot and recent group activity on main page
        try {
            const global = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
            const groupLogs = await DB.getGroupLogs();
            const potHtml = `
                <div class="card group-pot-card">
                    <div class="group-pot">
                        <p>Collective Pot</p>
                        <h2>€${(global.group_funds || 0).toFixed(2)}</h2>
                    </div>
                </div>`;
            app.innerHTML += potHtml;
            app.innerHTML += UI.renderLogs(groupLogs);
        } catch (e) {
            console.warn('Failed to render group pot on main page', e);
        }

        // Add analytics button
        const analyticsBtn = document.createElement('div');
        analyticsBtn.innerHTML = `<div style="margin-top:12px"><button class="btn-primary" onclick="window.location.href='analytics.html'">📊 Analytics</button></div>`;
        app.appendChild(analyticsBtn);

        // If admin, show a button to open the Admin view (separate, gated)
        const isAdmin = await Auth.checkAdminStatus();
        if (isAdmin) {
            const adminBtn = document.createElement('div');
            adminBtn.innerHTML = `<div style="margin-top:12px"><button class="btn-primary" onclick="window.showAdminView()">Open Admin Panel</button></div>`;
            app.appendChild(adminBtn);
        }
    }
};

// Standard way to launch the app
window.onload = () => App.init();

// Helper function for dark mode aware colors
window.getModalColors = () => {
    const isDarkMode = document.body.classList.contains('dark-mode');
    return {
        bg: isDarkMode ? '#2d2d2d' : '#ffffff',
        text: isDarkMode ? '#e8e8e8' : '#2d3436',
        inputBg: isDarkMode ? '#1e1e1e' : '#f9f9f9',
        inputBorder: isDarkMode ? '#444' : '#ddd',
        inputText: isDarkMode ? '#e8e8e8' : '#2d3436',
        secondaryText: isDarkMode ? '#a0a0a0' : '#636e72',
        accentBg: isDarkMode ? '#3d3d3d' : '#f0f0f0'
    };
};

window.handleCoffee = async () => {
    // Check the App object for the member we found during init
    if (!App.userMember) {
        alert("User data not loaded. Please refresh.");
        return;
    }

    try {
        const config = await DB.getGlobalConfig();
        const price = config.coffee_price_per_cup;

        // If user has non-positive balance, calculate surcharge to show total
        let surchargeAmt = 0;
        if ((App.userMember.balance || 0) <= 0) {
            surchargeAmt = Math.round((price * (config.surcharge_percent || 0) / 100) * 100) / 100;
        }

        const total = +(price + surchargeAmt);

        if (confirm(`Confirm coffee for ${App.userMember.name}? (€${price.toFixed(2)}${surchargeAmt > 0 ? ' + €' + surchargeAmt.toFixed(2) + ' surcharge = €' + total.toFixed(2) : ''})`)) {
            await DB.registerCoffeeWithDynamicPrice(App.userMember);
            location.reload(); 
        }
    } catch (e) {
        alert("Transaction failed. Check Appwrite permissions.");
    }
};

window.showClaimQR = async (memberId) => {
    try {
        // Fetch member to decide which link to show
        const member = await databases.getDocument(DB_ID, COLL_MEMBERS, memberId);
        const baseUrl = window.location.origin + window.location.pathname;

        let claimUrl;
        if (false && member && member.appwrite_uid) { // TEMP disabled
            // Member already linked to an Appwrite user: create a server-backed short-lived claim token
            const claim = await databases.createDocument(
                DB_ID,
                COLL_CLAIMS,
                ID.unique(),
                {
                    memberId,
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
                }
            );
            claimUrl = `${baseUrl}?claim_token=${claim.$id}`;
        } else {
            // Member has no Appwrite UID: fall back to legacy claim link
            claimUrl = `${baseUrl}?claim=${memberId}`;
        }

        // Show modal + QR (centered, with copy button and dark mode support)
        const isDarkMode = document.body.classList.contains('dark-mode');
        const modalBg = isDarkMode ? '#2d3436' : '#ffffff';
        const modalText = isDarkMode ? '#ffffff' : '#2d3436';
        const modalInputBg = isDarkMode ? '#1e1e1e' : '#ffffff';
        const modalInputBorder = isDarkMode ? '#555' : '#ddd';
        const modalSecondaryText = isDarkMode ? '#aaa' : '#666';

        const modalHtml = `
            <div class="modal-overlay" id="qr-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:10000;">
              <div class="card modal" style="padding:28px; max-width:420px; width:92%; border-radius:12px; text-align:center; background:${modalBg}; color:${modalText};">
                <button class="qr-close-btn" onclick="document.getElementById('qr-modal').remove()" style="position:absolute; right:18px; top:18px; background:none; border:none; font-size:18px; cursor:pointer; color:${modalText}">✕</button>
                <h3 style="margin-top:0; color:${modalText}">Share Identification</h3>
                <p style="margin:0.5rem 0 1rem 0; color:${modalSecondaryText}; font-size:0.9rem">Scan this code on a new device to link your account</p>
                <div id="qr-code" style="margin:16px auto; display:flex; justify-content:center;"></div>
                <input id="claim-link-input" style="flex:1; padding:8px 12px; border:1px solid ${modalInputBorder}; border-radius:6px; background:${modalInputBg}; color:${modalText}; font-size:0.85rem;" readonly value="${claimUrl}" />
                <button id="claim-copy-btn" class="btn-primary" style="white-space:nowrap">Copy</button>
              </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Populate QR and set up copy handler
        try {
            const qrTarget = document.getElementById('qr-code');
            const isDarkMode = document.body.classList.contains('dark-mode');
            new QRCode(qrTarget, {
                text: claimUrl,
                width: 250,
                height: 250,
                colorDark: isDarkMode ? '#ffffff' : '#2d3436',
                colorLight: isDarkMode ? '#2d3436' : '#ffffff'
            });

            const linkInput = document.getElementById('claim-link-input');
            linkInput.value = claimUrl;

            document.getElementById('claim-copy-btn').addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(claimUrl);
                } catch (err) {
                    // Fallback for older browsers
                    try {
                        linkInput.select();
                        document.execCommand('copy');
                    } catch (e) {
                        alert('Copy failed; select and copy manually');
                    }
                }
            });
        } catch (e) {
            console.error('Failed to render QR or set copy handler', e);
        }
    } catch (e) {
        console.error('Error creating claim token or fetching member:', e);
        alert('Could not create claim QR. See console for details.');
    }
};

window.showAddFunds = async (memberId) => {
    const amount = prompt("Enter amount to add to this tab (€):", "10.00");
    const msg = prompt("Note (e.g., 'Cash' or 'PayPal'):", "Cash payment");
    
    if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
        try {
            // 1. Get the member document first
            const member = await databases.getDocument(DB_ID, COLL_MEMBERS, memberId);
            
            // 2. Run the DB logic
            await DB.addFunds(member, parseFloat(amount), msg);
            
            alert(`Successfully added €${amount} to ${member.name}'s account.`);
            location.reload(); 
        } catch (error) {
            console.error(error);
            alert("Error adding funds. Check your Admin permissions.");
        }
    }
};

window.viewExpenseImage = async (fileId) => {
    try {
        // Construct the image download URL directly from Appwrite Storage API
        const imageUrl = `https://fra.cloud.appwrite.io/v1/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=699b182300263577e8a8`;
        
        // Create and show a modal with the image
        const modal = document.createElement('div');
        modal.id = 'image-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        modal.innerHTML = `
            <div style="position: relative; max-width: 90vw; max-height: 90vh;">
                <img src="${imageUrl}" style="max-width: 100%; max-height: 100%; border-radius: 12px;" />
                <button onclick="document.getElementById('image-modal').remove()" style="
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: white;
                    border: none;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    font-size: 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">✕</button>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        console.error("Error viewing image:", error);
        alert("Could not load image. Please try again.");
    }
};

window.showExpenseModal = () => {
    // Check if modal already exists to prevent duplicates
    if (document.getElementById('expense-modal')) return;

    const colors = window.getModalColors();
    const modalHtml = `
        <div class="modal-overlay" id="expense-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999;">
            <div class="card modal" style="background:${colors.bg}; color:${colors.text}; padding:30px; border-radius:24px; max-width:400px; width:90%;">
                <h3 style="margin-top:0; color:${colors.text}">Group Purchase</h3>
                <p style="color:${colors.secondaryText}"><small>Cost for beans, milk, or snacks.</small></p>
                
                <input type="number" id="exp-amount" placeholder="Amount (€)" step="0.01" style="width:100%; padding:12px; margin:10px 0; border:1px solid ${colors.inputBorder}; border-radius:8px; background:${colors.inputBg}; color:${colors.inputText}; box-sizing:border-box;">
                <input type="text" id="exp-msg" placeholder="Item (e.g. 1kg Espresso)" style="width:100%; padding:12px; margin:10px 0; border:1px solid ${colors.inputBorder}; border-radius:8px; background:${colors.inputBg}; color:${colors.inputText}; box-sizing:border-box;">
                <label style="display:block; margin-top:10px; font-size:0.8rem; color:${colors.secondaryText};">Optional: Receipt Photo</label>
                <input type="file" id="exp-file" accept="image/*" style="width:100%; margin-bottom:20px; color:${colors.inputText};">
                
                <div style="display:flex; gap:10px;">
                    <button onclick="window.submitExpense()" class="btn-primary" style="flex:2">Save</button>
                    <button onclick="document.getElementById('expense-modal').remove()" class="btn-cancel" style="flex:1">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.submitExpense = async () => {
    const amountInput = document.getElementById('exp-amount');
    const msgInput = document.getElementById('exp-msg');
    const fileInput = document.getElementById('exp-file');

    const amount = amountInput.value;
    const msg = msgInput.value;
    const file = fileInput.files[0];

    if (!amount || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    try {
        // Disable button to prevent double-submitting
        const saveBtn = document.querySelector('#expense-modal .btn-primary');
        saveBtn.innerText = "Saving...";
        saveBtn.disabled = true;

        await DB.recordExpense(amount, msg, file);
        
        alert("Expense recorded! Collective pot updated.");
        location.reload();
    } catch (e) {
        console.error(e);
        alert("Error saving expense. Check console for details.");
        // Re-enable button on error
        const saveBtn = document.querySelector('#expense-modal .btn-primary');
        saveBtn.innerText = "Save";
        saveBtn.disabled = false;
    }
};

window.showCoffeeBeanModal = () => {
    if (document.getElementById('bean-modal')) return;

    const colors = window.getModalColors();
    const modalHtml = `
        <div class="modal-overlay" id="bean-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999;">
            <div class="card modal" style="background:${colors.bg}; color:${colors.text}; padding:30px; border-radius:24px; max-width:400px; width:90%;">
                <h3 style="margin-top:0; color:${colors.text}">🫘 Buy Coffee Beans</h3>
                <p style="color:${colors.secondaryText}"><small>Record a coffee bean purchase and update the price per cup.</small></p>
                
                <input type="number" id="bean-amount" placeholder="Cost (€)" step="0.01" style="width:100%; padding:12px; margin:10px 0; border:1px solid ${colors.inputBorder}; border-radius:8px; background:${colors.inputBg}; color:${colors.inputText}; box-sizing:border-box;">
                <input type="number" id="bean-grams" placeholder="Weight (grams)" step="1" style="width:100%; padding:12px; margin:10px 0; border:1px solid ${colors.inputBorder}; border-radius:8px; background:${colors.inputBg}; color:${colors.inputText}; box-sizing:border-box;">
                <div style="background:${colors.accentBg}; color:${colors.text}; padding:15px; border-radius:8px; margin:15px 0; font-size:0.9rem;">
                    <p style="margin:0 0 8px 0;"><b>Calculation:</b></p>
                    <p style="margin:0;">Price/kg: <span id="price-per-kg">€0.00</span></p>
                    <p style="margin:5px 0 0 0;">Price/cup: <span id="price-per-cup">€0.00</span> <span id="grams-info"></span></p>
                </div>
                
                <label style="display:block; margin-top:10px; font-size:0.8rem; color:${colors.secondaryText};">Optional: Receipt Photo</label>
                <input type="file" id="bean-file" accept="image/*" style="width:100%; margin-bottom:20px; color:${colors.inputText};">
                
                <div style="display:flex; gap:10px;">
                    <button onclick="window.submitCoffeeBeans()" class="btn-primary" style="flex:2">Save</button>
                    <button onclick="document.getElementById('bean-modal').remove()" class="btn-cancel" style="flex:1">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Add real-time calculation
    const amountInput = document.getElementById('bean-amount');
    const gramsInput = document.getElementById('bean-grams');

    const updateCalculation = async () => {
        const amount = parseFloat(amountInput.value) || 0;
        const grams = parseFloat(gramsInput.value) || 1;
        const config = await DB.getGlobalConfig();
        
        const pricePerKg = amount > 0 ? (amount / grams * 1000).toFixed(2) : '0.00';
        const pricePerCup = amount > 0 ? (amount / grams * config.grams_per_cup).toFixed(2) : '0.00';
        
        document.getElementById('price-per-kg').textContent = '€' + pricePerKg;
        document.getElementById('price-per-cup').textContent = '€' + pricePerCup;
        document.getElementById('grams-info').textContent = `(${config.grams_per_cup}g/cup)`;
    };

    amountInput.addEventListener('input', updateCalculation);
    gramsInput.addEventListener('input', updateCalculation);
    updateCalculation();
};

window.submitCoffeeBeans = async () => {
    const amountInput = document.getElementById('bean-amount');
    const gramsInput = document.getElementById('bean-grams');
    const fileInput = document.getElementById('bean-file');

    const amount = parseFloat(amountInput.value);
    const grams = parseFloat(gramsInput.value);
    const file = fileInput.files[0];

    if (!amount || amount <= 0 || !grams || grams <= 0) {
        alert("Please enter valid amount and weight.");
        return;
    }

    try {
        const saveBtn = document.querySelector('#bean-modal .btn-primary');
        saveBtn.innerText = "Saving...";
        saveBtn.disabled = true;

        await DB.recordCoffeeBeanPurchase(amount, grams, file);
        
        alert("Coffee beans purchased! Price per cup updated.");
        location.reload();
    } catch (e) {
        console.error(e);
        alert("Error saving purchase. Check console for details.");
        const saveBtn = document.querySelector('#bean-modal .btn-primary');
        saveBtn.innerText = "Save";
        saveBtn.disabled = false;
    }
};

window.showGramsConfigModal = async () => {
    if (document.getElementById('grams-modal')) return;

    const colors = window.getModalColors();
    const config = await DB.getGlobalConfig();

    const modalHtml = `
        <div class="modal-overlay" id="grams-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999;">
            <div class="card modal" style="background:${colors.bg}; color:${colors.text}; padding:30px; border-radius:24px; max-width:400px; width:90%;">
                <h3 style="margin-top:0; color:${colors.text}">⚙️ Cup Weight Configuration</h3>
                <p style="color:${colors.secondaryText}"><small>Set how many grams of coffee are used per cup. This affects the dynamic price calculation.</small></p>
                
                <label style="display:block; font-weight:600; margin-bottom:8px; color:${colors.text};">Grams per Cup:</label>
                <input type="number" id="grams-input" placeholder="Grams" step="0.5" min="1" value="${config.grams_per_cup}" style="width:100%; padding:12px; margin:10px 0; border:1px solid ${colors.inputBorder}; border-radius:8px; background:${colors.inputBg}; color:${colors.inputText}; box-sizing:border-box;">
                
                <div style="background:${colors.accentBg}; color:${colors.text}; padding:15px; border-radius:8px; margin:15px 0; font-size:0.9rem;">
                    <p style="margin:0;"><b>Current Price per Cup: €${config.coffee_price_per_cup.toFixed(2)}</b></p>
                    <p style="margin:8px 0 0 0; color:${colors.secondaryText}; font-size:0.85rem;">Price will update when beans are next purchased with new weight.</p>
                </div>
                
                <div style="display:flex; gap:10px;">
                    <button onclick="window.submitGramsConfig()" class="btn-primary" style="flex:2">Save</button>
                    <button onclick="document.getElementById('grams-modal').remove()" class="btn-cancel" style="flex:1">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.submitGramsConfig = async () => {
    const gramsInput = document.getElementById('grams-input');
    const grams = parseFloat(gramsInput.value);

    if (!grams || grams <= 0) {
        alert("Please enter a valid gram value.");
        return;
    }

    try {
        const saveBtn = document.querySelector('#grams-modal .btn-primary');
        saveBtn.innerText = "Saving...";
        saveBtn.disabled = true;

        await DB.updateGramsPerCup(grams);
        
        alert("Cup weight updated! Price per cup has been recalculated automatically.");
        location.reload();
    } catch (e) {
        console.error(e);
        alert("Error saving configuration. Check console for details.");
        const saveBtn = document.querySelector('#grams-modal .btn-primary');
        saveBtn.innerText = "Save";
        saveBtn.disabled = false;
    }
};

window.toggleTheme = () => {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
};

window.showAdminView = async () => {
    // Ensure only admins can open this
    const isAdmin = await Auth.checkAdminStatus();
    if (!isAdmin) {
        alert('Access denied: Admins only');
        return;
    }

    try {
        const app = document.getElementById('app');
        const members = await DB.getAllMembers();
        const global = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
        const logs = await DB.getLogs();

        app.innerHTML = '';
        app.innerHTML += UI.renderAdminPanel(members, global.group_funds || 0);
        app.innerHTML += UI.renderLogs(logs);
    } catch (e) {
        console.error('Failed to open admin view', e);
        alert('Could not open admin panel. See console for details.');
    }
};

window.showTopupInfoModal = () => {
    if (document.getElementById('topup-modal')) return;
    const colors = window.getModalColors();
    const modalHtml = `
        <div class="modal-overlay" id="topup-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999;">
            <div class="card modal" style="background:${colors.bg}; color:${colors.text}; padding:24px; border-radius:16px; max-width:480px; width:92%;">
                <button onclick="document.getElementById('topup-modal').remove()" style="position:absolute; right:18px; top:18px; background:none; border:none; font-size:18px; cursor:pointer; color:${colors.text}">✕</button>
                <h3 style="margin-top:0; color:${colors.text}">How to top up</h3>
                <p style="color:${colors.secondaryText};">You can top up your balance by sending money to this paypal pool. We use this pool to buy new coffee beans and supplies.</p>
                <p style="color:${colors.text}; font-weight:600; margin:12px 0 6px 0;">PayPal Pool Link:</p>
                <input type="text" id="topup-link-input" value="https://paypal.com/pools/c/8QyD1vX9g7" readonly style="width:100%; padding:10px; border:1px solid ${colors.inputBorder}; border-radius:8px; background:${colors.inputBg}; color:${colors.inputText}; box-sizing:border-box;">
                <button onclick="window.open('https://www.paypal.com/pool/9mVAycjQpz?sr=wccr', '_blank')" class="btn-primary" style="margin-top:10px;">Open PayPal Pool</button>
                <div style="display:flex; gap:10px; margin-top:12px; justify-content:flex-end;">
                    <button onclick="document.getElementById('topup-modal').remove()" class="btn-primary">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.showSurchargeConfigModal = async () => {
    if (document.getElementById('surcharge-modal')) return;
    const colors = window.getModalColors();
    const config = await DB.getGlobalConfig();
    const modalHtml = `
        <div class="modal-overlay" id="surcharge-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999;">
            <div class="card modal" style="background:${colors.bg}; color:${colors.text}; padding:24px; border-radius:16px; max-width:420px; width:92%;">
                <button onclick="document.getElementById('surcharge-modal').remove()" style="position:absolute; right:18px; top:18px; background:none; border:none; font-size:18px; cursor:pointer; color:${colors.text}">✕</button>
                <h3 style="margin-top:0; color:${colors.text}">Configure Surcharge</h3>
                <p style="color:${colors.secondaryText};"><small>Set the surcharge percentage applied when a user has a non-positive balance.</small></p>
                <label style="display:block; font-weight:600; margin:8px 0 6px 0; color:${colors.text};">Surcharge percent (%):</label>
                <input type="number" id="surcharge-input" value="${config.surcharge_percent || 10}" step="0.1" min="0" style="width:100%; padding:10px; border:1px solid ${colors.inputBorder}; border-radius:8px; background:${colors.inputBg}; color:${colors.inputText}; box-sizing:border-box;">
                <div style="display:flex; gap:10px; margin-top:14px; justify-content:flex-end;">
                    <button onclick="window.submitSurchargeConfig()" class="btn-primary">Save</button>
                    <button onclick="document.getElementById('surcharge-modal').remove()" class="btn-cancel">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.submitSurchargeConfig = async () => {
    const input = document.getElementById('surcharge-input');
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) {
        alert('Please enter a valid surcharge percent (>= 0).');
        return;
    }
    try {
        const saveBtn = document.querySelector('#surcharge-modal .btn-primary');
        saveBtn.innerText = 'Saving...';
        saveBtn.disabled = true;
        await DB.updateSurchargePercent(val);
        alert('Surcharge percent updated.');
        location.reload();
    } catch (e) {
        console.error(e);
        alert('Error saving surcharge percent. Check console for details.');
        const saveBtn = document.querySelector('#surcharge-modal .btn-primary');
        saveBtn.innerText = 'Save';
        saveBtn.disabled = false;
    }
};