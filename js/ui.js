const UI = {
    renderUserStats(member) {
        return `
            <div class="card">
                <h2>Welcome, ${member.name}</h2>
                <div class="stat-grid">
                    <div class="stat"><span>Balance</span> <b>€${member.balance.toFixed(2)}</b></div>
                    <div class="stat"><span>Coffees</span> <b>${member.total_coffees}</b></div>
                </div>
                <button onclick="handleCoffee()" class="btn-primary">☕ Get Coffee (€0.50)</button>
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