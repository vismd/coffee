const DB = {
    // 1. Fetch member by their Appwrite UID (Missing function fix)
    async getMemberByUid(uid) {
        try {
            const result = await databases.listDocuments(DB_ID, COLL_MEMBERS, [
                Appwrite.Query.equal('appwrite_uid', uid)
            ]);
            return result.documents[0] || null;
        } catch (error) {
            console.error("Error fetching member:", error);
            return null;
        }
    },

    // 2. Fetch all members (for Admin panel)
    async getAllMembers() {
        const result = await databases.listDocuments(DB_ID, COLL_MEMBERS);
        return result.documents;
    },
    
    // Log an action (Coffee, Funds, Purchase)
    async logAction(type, amount, userId, userName, message = "", fileId = null) {
        return await databases.createDocument(DB_ID, COLL_LOGS, ID.unique(), {
            type,
            amount: parseFloat(amount),
            userId,
            userName,
            message,
            fileId,
            timestamp: new Date().toISOString()
        });
    },

    // Fetch latest 10 logs
    async getLogs() {
        const result = await databases.listDocuments(DB_ID, COLL_LOGS, [
            Appwrite.Query.orderDesc('timestamp'),
            Appwrite.Query.limit(10)
        ]);
        return result.documents;
    },

    // Record a coffee (+1 drink, -price from user balance)
    async registerCoffee(memberDoc, price) {
        const newBalance = memberDoc.balance - price;
        const newTotal = memberDoc.total_coffees + 1;
        
        await databases.updateDocument(DB_ID, COLL_MEMBERS, memberDoc.$id, {
            balance: newBalance,
            total_coffees: newTotal
        });
        
        return await this.logAction('COFFEE', -price, memberDoc.$id, memberDoc.name);
    },

    // Admin: Add funds to user and update group balance
    async addFunds(memberDoc, amount, message, adminName) {
        // 1. Update User
        await databases.updateDocument(DB_ID, COLL_MEMBERS, memberDoc.$id, {
            balance: memberDoc.balance + amount
        });
        
        // 2. Update Global Group Balance (assuming a singleton doc with ID 'main')
        const global = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
        await databases.updateDocument(DB_ID, COLL_GLOBAL, 'main', {
            group_funds: global.group_funds + amount
        });

        return await this.logAction('TOPUP', amount, memberDoc.$id, memberDoc.name, message);
    }
};