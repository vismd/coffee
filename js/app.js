const App = {
    userMember: null, // This acts as our "Global State"

    async init() {
        try {
            // Load theme preference from localStorage
            const savedTheme = localStorage.getItem('theme') || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                document.getElementById('theme-toggle').textContent = '☀️';
            }

            const urlParams = new URLSearchParams(window.location.search);
            const claimId = urlParams.get('claim');
            const claimToken = urlParams.get('claim_token');

            // 1. Get/Create Session
            const sessionUser = await Auth.initSession();

            // 2a. If we have a server-backed claim_token, exchange it for a JWT via Cloud Function
            if (claimToken) {
                try {
                    const exec = await functions.createExecution(CLAIM_FUNCTION_ID, JSON.stringify({ token: claimToken }));

                    // Poll for execution completion (timeout after ~15s)
                    const start = Date.now();
                    let check = exec;
                    while ((check.status !== 'completed') && (Date.now() - start < 15000)) {
                        await new Promise(r => setTimeout(r, 800));
                        check = await functions.getExecution(CLAIM_FUNCTION_ID, exec.$id);
                    }

                    if (check.status === 'completed' && check.response) {
                        const result = JSON.parse(check.response);
                        if (result && result.jwt) {
                            await client.setJWT(result.jwt);
                            // Reload as authenticated user
                            window.location.href = window.location.pathname;
                            return;
                        } else {
                            alert('Claim exchange failed: ' + (result?.error || 'no jwt returned'));
                        }
                    } else {
                        alert('Claim exchange timed out or failed.');
                    }
                } catch (e) {
                    console.error('Claim exchange error:', e);
                    alert('Claim exchange failed.');
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
                    <div class="card fade-in">
                        <p>No account linked to this device.</p>
                        <p><small>ID: ${sessionUser.$id}</small></p>
                    </div>`;
            }
        } catch (error) {
            console.error("Init Error:", error);
        }
    },

    async renderDashboard() {
        const app = document.getElementById('app');
        
        // Render personal UI
        app.innerHTML = UI.renderUserStats(this.userMember);

        // Check for Admin status to show extra panels
        const isAdmin = await Auth.checkAdminStatus();
        if (isAdmin) {
            const members = await DB.getAllMembers();
            const global = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
            const logs = await DB.getLogs(); // If you've added this function
            
            app.innerHTML += UI.renderAdminPanel(members, global.group_funds);
            app.innerHTML += UI.renderLogs(logs);
        }
    }
};

// Standard way to launch the app
window.onload = () => App.init();

window.handleCoffee = async () => {
    // Check the App object for the member we found during init
    if (!App.userMember) {
        alert("User data not loaded. Please refresh.");
        return;
    }

    if (confirm(`Confirm coffee for ${App.userMember.name}?`)) {
        try {
            await DB.registerCoffee(App.userMember, 0.50);
            location.reload(); 
        } catch (e) {
            alert("Transaction failed. Check Appwrite permissions.");
        }
    }
};

window.showClaimQR = async (memberId) => {
    try {
        // Create a single-use claim document (5 minute expiry)
        // Include permissions so the client may create it without changing collection defaults.
        // For production, tighten these permissions (e.g., to the creating user) as needed.
        const claim = await databases.createDocument(
            DB_ID,
            COLL_CLAIMS,
            ID.unique(),
            {
                memberId,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            },
            ["role:all"], // read permissions
            ["role:all"]  // write permissions
        );

        // Build URL with claim_token
        const baseUrl = window.location.origin + window.location.pathname;
        const claimUrl = `${baseUrl}?claim_token=${claim.$id}`;

        // Show modal + QR
        const modal = document.createElement('div');
        modal.className = 'qr-modal';
        modal.id = 'qr-modal';
        modal.innerHTML = `
            <div class="qr-modal-content">
                <button class="qr-close-btn" onclick="document.getElementById('qr-modal').remove()">✕</button>
                <h3>Share Identification</h3>
                <p>Scan this code on a new device to link your account</p>
                <div id="qr-code"></div>
                <p style="font-size: 0.75rem; margin-top: 1rem; word-break: break-all;">${claimUrl}</p>
            </div>
        `;
        document.body.appendChild(modal);

        new QRCode(document.getElementById('qr-code'), {
            text: claimUrl,
            width: 250,
            height: 250,
            colorDark: '#2d3436',
            colorLight: '#ffffff'
        });
    } catch (e) {
        console.error('Error creating claim token:', e);
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

    const modalHtml = `
        <div class="modal-overlay" id="expense-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999;">
            <div class="card modal" style="background:white; padding:30px; border-radius:24px; max-width:400px; width:90%;">
                <h3 style="margin-top:0">Group Purchase</h3>
                <p><small>Cost for beans, milk, or snacks.</small></p>
                
                <input type="number" id="exp-amount" placeholder="Amount (€)" step="0.01" style="width:100%; padding:12px; margin:10px 0; border:1px solid #ddd; border-radius:8px;">
                <input type="text" id="exp-msg" placeholder="Item (e.g. 1kg Espresso)" style="width:100%; padding:12px; margin:10px 0; border:1px solid #ddd; border-radius:8px;">
                <label style="display:block; margin-top:10px; font-size:0.8rem;">Optional: Receipt Photo</label>
                <input type="file" id="exp-file" accept="image/*" style="width:100%; margin-bottom:20px;">
                
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

window.toggleTheme = () => {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
};