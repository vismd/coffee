const UI = {
    renderUserStats(member) {
        return `
            <div class="card">
                <h2>Welcome, ${member.name}</h2>
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
                <button class="btn-topup" onclick="window.showAddFunds('${m.$id}')">+</button>
            </div>
        `).join('');

        // THIS IS THE MISSING PIECE:
        return `
            <div class="card admin-card fade-in">
                <div class="group-pot">
                    <p>Collective Pot</p>
                    <h2>€${groupFunds.toFixed(2)}</h2>
                </div>
                <button class="btn-primary" onclick="window.showExpenseModal()">Record Group Purchase</button>
                <div class="member-list">
                    ${rows}
                </div>
            </div>
        `;
    }
};

UI.renderLogs = (logs) => {
    const items = logs.map(log => {
        const hasImage = log.fileId; // Check if this log has an associated image
        const imageBtn = hasImage ? `<button class="btn-view-image" onclick="window.viewExpenseImage('${log.fileId}')">🖼️ Receipt</button>` : '';
        
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