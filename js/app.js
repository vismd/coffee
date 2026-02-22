const App = {
    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        const claimId = urlParams.get('claim');

        // 1. Ensure user has a session (Anonymous or otherwise)
        let sessionUser = await Auth.initSession();

        // 2. If user scanned a QR code (?claim=ID)
        if (claimId) {
            await Auth.claimIdentity(claimId);
            // Remove the query param from URL for cleanliness
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 3. Identify who this session belongs to
        const member = await DB.getMemberByUid(sessionUser.$id);
        
        if (member) {
            this.renderDashboard(member);
        } else {
            document.getElementById('app').innerHTML = `<p>Please ask Admin for a setup QR code.</p>`;
        }
    },

    async renderDashboard(member) {
        const app = document.getElementById('app');
        app.innerHTML = UI.renderUserStats(member);
        
        // Check if user is Admin to show Admin Panel
        const isAdmin = await Auth.checkAdminStatus();
        if (isAdmin) {
            const allMembers = await DB.getAllMembers();
            const global = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
            app.innerHTML += UI.renderAdminPanel(allMembers, global.group_funds);
        }
    }
};

window.onload = () => App.init();

window.handleCoffee = async () => {
    // 1. Check if we have the user's data loaded
    if (!App.userMember) {
        alert("User data not loaded. Please refresh.");
        return;
    }

    // 2. Ask for confirmation (prevents accidental clicks)
    if (confirm("Confirm 1 Coffee (€0.50)?")) {
        try {
            // 3. Call the DB function with the required data
            await DB.registerCoffee(App.userMember, 0.50);
            
            alert("Enjoy your coffee! ☕");
            
            // 4. Refresh to show the new balance
            location.reload(); 
        } catch (error) {
            console.error(error);
            alert("Error: Could not save transaction.");
        }
    }
};