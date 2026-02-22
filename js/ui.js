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
        let rows = members.map(m => `
            <tr>
                <td>${m.name}</td>
                <td>€${m.balance.toFixed(2)}</td>
                <td><button onclick="showAddFunds('${m.$id}')">Add €</button></td>
            </tr>
        `).join('');

        return `
            <div class="admin-panel">
                <h3>Admin Control</h3>
                <p>Group Pot: <strong>€${groupFunds.toFixed(2)}</strong></p>
                <button onclick="showExpenseModal()">Record Purchase (Receipt)</button>
                <table>${rows}</table>
            </div>
        `;
    }
};

UI.renderLogs = (logs) => {
    const items = logs.map(log => `
        <div class="log-item">
            <span class="log-date">${new Date(log.timestamp).toLocaleDateString()}</span>
            <span class="log-desc"><b>${log.userName}</b>: ${log.type}</span>
            <span class="log-amt ${log.amount < 0 ? 'neg' : 'pos'}">${log.amount > 0 ? '+' : ''}${log.amount.toFixed(2)}</span>
        </div>
    `).join('');
    
    return `<div class="card logs-card"><h3>Recent Activity</h3>${items}</div>`;
};