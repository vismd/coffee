const UI = {
    renderUserStats(member) {
        return `
            <div class="card welcome-card">
                <div class="welcome-header">
                    <h2>Welcome, ${member.name}</h2>
                    <button class="btn-qr" onclick="window.showClaimQR('${member.$id}')" title="Share identification code">📱</button>
                </div>
                <div class="stat-grid">
                    <div class="stat"><span>Balance</span> <b>€${member.balance.toFixed(2)}</b></div>
                    <div class="stat"><span>Coffees</span> <b>${member.total_coffees}</b></div>
                </div>
                <button onclick="window.handleCoffee()" class="btn-primary">☕ Get Coffee (€0.50)</button>
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
                  <button class="btn-qr-small" title="Show claim QR" onclick="window.showClaimQR('${m.$id}')">📱</button>
                  <button class="btn-topup" onclick="window.showAddFunds('${m.$id}')">+</button>
                </div>
            </div>
        `).join('');

                // THIS IS THE MISSING PIECE:
                return `
                        <div class="card admin-card fade-in">
                                <div class="group-pot" style="width:100%; text-align:left; padding:16px 20px; box-sizing:border-box;">
                                        <p style="margin:0; font-size:0.9rem; color:#666">Collective Pot</p>
                                        <h2 style="margin:6px 0 0 0">€${groupFunds.toFixed(2)}</h2>
                                </div>
                                <div style="margin-top:12px; display:flex; gap:10px;">
                                    <button class="btn-primary" onclick="window.showExpenseModal()">Record Group Purchase</button>
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