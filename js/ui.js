const UI = {
    renderUserStats(member, coffeePrice = 0.50, surchargePercent = 10) {
        return `
            <div class="card welcome-card">
                    <div class="welcome-header">
                    <h2>Welcome, ${member.name}</h2>
                    <button class="btn-qr" onclick="window.showClaimQR('${member.$id}')" title="Share identification code">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <rect x="3" y="3" width="6" height="6" />
                            <rect x="15" y="3" width="6" height="6" />
                            <rect x="3" y="15" width="6" height="6" />
                            <rect x="11" y="11" width="2" height="2" />
                            <rect x="17" y="11" width="2" height="2" />
                            <rect x="11" y="17" width="2" height="2" />
                        </svg>
                    </button>
                </div>
                <div class="stat-grid">
                    <div class="stat"><span>Balance</span> <b>€${member.balance.toFixed(2)}</b></div>
                    <div class="stat"><span>Coffees</span> <b>${member.total_coffees}</b></div>
                </div>
                ${member.balance < 5 ? `
                    <div class="low-balance-notice" style="background:#FF8775;border-left:4px solid #FF2F0F;padding:10px;border-radius:6px;margin-bottom:10px;display:flex;flex-direction:column;align-items:stretch;gap:8px;"> 
                        <div style="color:#fff; width:100%;">There will be a surcharge of <b>€${(Math.round((coffeePrice * (surchargePercent||0) / 100) * 100)/100).toFixed(2)}</b> per coffee because your balance is low.<br><b>Please top up your account.</b></div>
                        <div style="display:flex;gap:8px; width:100%; justify-content:flex-end;">
                            <button class="btn-primary" onclick="window.showTopupInfoModal()" style="white-space:nowrap;">How to top up</button>
                        </div>
                    </div>
                ` : ''}

                <button onclick="window.handleCoffee()" class="btn-primary">☕ Get Coffee (€${coffeePrice.toFixed(2)}${(member.balance <= 0) ? ` <span style=\"color:#ff3b30; margin-left:6px; font-weight:600;\">+ €${(Math.round((coffeePrice * (surchargePercent||0) / 100) * 100)/100).toFixed(2)})</span>` : ''}</button>
            </div>
        `;
    },

    renderAdminPanel(members, groupFunds) {
        const rows = members.map(m => `
            <div class="member-row">
                <span class="member-name">${m.name}</span>
                <span class="member-balance ${m.balance < 0 ? 'neg' : 'pos'}">
                    €${m.balance.toFixed(2)}
                </span>
                <div style="display:flex; gap:6px; align-items:center;">
                                    <button class="btn-qr" title="Show claim QR" onclick="window.showClaimQR('${m.$id}')">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                                <rect x="3" y="3" width="6" height="6" />
                                                <rect x="15" y="3" width="6" height="6" />
                                                <rect x="3" y="15" width="6" height="6" />
                                                <rect x="11" y="11" width="2" height="2" />
                                                <rect x="17" y="11" width="2" height="2" />
                                                <rect x="11" y="17" width="2" height="2" />
                                        </svg>
                                    </button>
                  <button class="btn-topup" onclick="window.showAddFunds('${m.$id}')">+</button>
                </div>
            </div>
        `).join('');

                // THIS IS THE MISSING PIECE:
                return `
                        <div class="card admin-card fade-in">
                                <div class="group-pot">
                                    <p>Collective Pot</p>
                                    <h2>€${(groupFunds || 0).toFixed(2)}</h2>
                                </div>
                                <div style="margin-top:12px; display:flex; gap:10px; flex-wrap: wrap;">
                                                    <button class="btn-primary" onclick="window.showExpenseModal()">Record Group Purchase</button>
                                                    <button class="btn-primary" onclick="window.showCoffeeBeanModal()" style="background: #6c5ce7;">🫘 Buy Coffee Beans</button>
                                                    <button class="btn-primary" onclick="window.showGramsConfigModal()" style="background: #00b894;">⚙️ Config Cup Weight</button>
                                                    <button class="btn-primary" onclick="window.showSurchargeConfigModal()" style="background:#ff7675">⚖️ Configure Surcharge</button>
                                                </div>
                                <div class="member-list">
                                        ${rows}
                                </div>
                                <div style="margin-top:12px">
                                    <button class="btn-primary" onclick="App.init()">Return to main view</button>
                                </div>
                        </div>
                `;
    }
};

UI.renderLogs = (logs) => {
    const items = logs.map(log => {
        const hasImage = log.fileId; // Check if this log has an associated image
        const imageBtn = hasImage ? `<button class="btn-view-image" onclick="window.viewExpenseImage('${log.fileId}')">Receipt</button>` : '';
        
        return `
        <div class="log-item">
            <span class="log-date">${new Date(log.timestamp).toLocaleDateString()}</span>
            <span class="log-desc"><b>${log.userName}</b>: ${log.type}</span>
            ${imageBtn}
            <span class="log-amt ${log.amount < 0 ? 'neg' : 'pos'}">${log.amount > 0 ? '+' : ''}${log.amount.toFixed(2)}</span>
        </div>
    `;
    }).join('');
    
    return `<div class="card logs-card"><h3>Recent Activity</h3>${items}</div>`;
};