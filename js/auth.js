const Auth = {
    async initSession() {
        try {
            // Check if session exists
            return await account.get();
        } catch (e) {
            // If device is linked (linking in progress), wait briefly for session to initialize
            const linkedUid = localStorage.getItem('LINKED_APPWRITE_UID');
            if (linkedUid) {
                console.info('Device is linked but session not yet ready. Waiting...');
                // Wait a moment for Appwrite to recognize the session
                await new Promise(r => setTimeout(r, 500));
                try {
                    return await account.get();
                } catch (e2) {
                    console.warn('Session still not ready after wait, attempting to create new session');
                }
            }
            // Create anonymous session (persists in cookie)
            return await account.createAnonymousSession();
        }
    },

    async checkAdminStatus() {
        try {
            const user = await account.get();
            // This returns true if the 'admin' label exists on your user account
            return user.labels && user.labels.includes('admin');
        } catch (e) {
            return false;
        }
    },

    // Generate a QR link for the admin to give to a user
    // The link would look like: site.com/?claim=MEMBER_ID
    async claimIdentity(memberId) {
        const user = await account.get();
        await databases.updateDocument(DB_ID, COLL_MEMBERS, memberId, {
            appwrite_uid: user.$id
        });
        window.location.href = window.location.pathname; // Refresh
    }
};