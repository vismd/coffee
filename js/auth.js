const Auth = {
    async initSession() {
        try {
            // Check if session exists
            return await account.get();
        } catch (e) {
            // Create anonymous session (persists in cookie)
            return await account.createAnonymousSession();
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