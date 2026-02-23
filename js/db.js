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

    // Fetch latest 10 group (EXPENSE) logs only
    async getGroupLogs() {
        const result = await databases.listDocuments(DB_ID, COLL_LOGS, [
            //type is EXPENSE or BEANS
            Appwrite.Query.or([
                Appwrite.Query.equal('type', 'EXPENSE'),
                Appwrite.Query.equal('type', 'BEANS')
            ]),
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

    async recordExpense(amount, message, file) {
        let fileId = null;

        // 1. If the admin selected a photo, upload it first
        if (file) {
            try {
                const uploadedFile = await storage.createFile(
                    BUCKET_ID,          // Must match the ID in Appwrite Storage
                    Appwrite.ID.unique(), 
                    file
                );
                fileId = uploadedFile.$id;
            } catch (storageError) {
                console.error("Storage Upload Failed:", storageError);
                // We can decide to continue without the photo or stop here
                throw new Error("Receipt upload failed. Expense not recorded.");
            }
        }

        // 2. Update Global Pot
        const global = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
        await databases.updateDocument(DB_ID, COLL_GLOBAL, 'main', {
            group_funds: global.group_funds - parseFloat(amount)
        });

        // 3. Log it
        return await this.logAction('EXPENSE', -amount, 'ADMIN', 'System', message, fileId);
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
    },

    // Get global configuration (grams per cup, etc.)
    async getGlobalConfig() {
        try {
            const config = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
            return {
                group_funds: config.group_funds || 0,
                grams_per_cup: config.grams_per_cup || 18, // Default 18g per cup
                coffee_price_per_cup: config.coffee_price_per_cup || 0.50,
                coffee_price_per_gram: config.coffee_price_per_gram || 0.0278 // Default based on 0.50/18g
            };
        } catch (error) {
            console.error("Error fetching global config:", error);
            return {
                group_funds: 0,
                grams_per_cup: 18,
                coffee_price_per_cup: 0.50,
                coffee_price_per_gram: 0.0278
            };
        }
    },

    // Update grams per cup configuration and recalculate price per cup
    async updateGramsPerCup(gramsPerCup) {
        try {
            const config = await this.getGlobalConfig();
            const newPricePerCup = config.coffee_price_per_gram * gramsPerCup;
            
            await databases.updateDocument(DB_ID, COLL_GLOBAL, 'main', {
                grams_per_cup: parseFloat(gramsPerCup),
                coffee_price_per_cup: newPricePerCup
            });
            return true;
        } catch (error) {
            console.error("Error updating grams per cup:", error);
            throw error;
        }
    },

    // Record coffee bean purchase with optional receipt upload
    async recordCoffeeBeanPurchase(amount, grams, file = null) {
        try {
            let fileId = null;
            
            // 1. Upload receipt file if provided
            if (file) {
                try {
                    const uploadedFile = await storage.createFile(
                        BUCKET_ID,
                        Appwrite.ID.unique(),
                        file
                    );
                    fileId = uploadedFile.$id;
                } catch (storageError) {
                    console.error("Receipt upload failed:", storageError);
                    throw new Error("Receipt upload failed. Purchase not recorded.");
                }
            }

            const pricePerGram = amount / grams;
            const config = await this.getGlobalConfig();
            const pricePerCup = pricePerGram * config.grams_per_cup;

            // 2. Update global funds and pricing info
            const global = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
            await databases.updateDocument(DB_ID, COLL_GLOBAL, 'main', {
                group_funds: global.group_funds - amount,
                coffee_price_per_cup: pricePerCup,
                coffee_price_per_gram: pricePerGram
            });

            // 3. Log as BEANS so it shows in group logs
            const logMessage = `🫘 Coffee Beans: ${grams}g @ €${(pricePerGram * 1000).toFixed(2)}/kg (€${pricePerCup.toFixed(2)}/cup)`;
            return await this.logAction('BEANS', -amount, 'ADMIN', 'System', logMessage, fileId);
        } catch (error) {
            console.error("Error recording bean purchase:", error);
            throw error;
        }
    },

    // Register coffee with dynamic pricing
    async registerCoffeeWithDynamicPrice(memberDoc) {
        try {
            const config = await this.getGlobalConfig();
            const price = config.coffee_price_per_cup;
            
            const newBalance = memberDoc.balance - price;
            const newTotal = memberDoc.total_coffees + 1;
            
            await databases.updateDocument(DB_ID, COLL_MEMBERS, memberDoc.$id, {
                balance: newBalance,
                total_coffees: newTotal
            });
            
            return await this.logAction('COFFEE', -price, memberDoc.$id, memberDoc.name);
        } catch (error) {
            console.error("Error registering coffee:", error);
            throw error;
        }
    }
};