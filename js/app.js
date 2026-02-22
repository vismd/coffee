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