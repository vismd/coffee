const App = {
    userMember: null, // This acts as our "Global State"

    async init() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const claimId = urlParams.get('claim');

            // 1. Get/Create Session
            const sessionUser = await Auth.initSession();

            // 2. Handle QR Claim if present
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