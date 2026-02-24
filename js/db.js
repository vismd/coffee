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

    async recordExpense(amount, message, file, distributionMethod = 'collective') {
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

        // 3. Handle distribution to members if specified
        if (distributionMethod === 'coowners' || distributionMethod === 'all') {
            const allMembers = await this.getAllMembers();
            let targetMembers = [];

            if (distributionMethod === 'coowners') {
                targetMembers = allMembers.filter(m => m.is_coowner === true);
            } else if (distributionMethod === 'all') {
                targetMembers = allMembers;
            }

            if (targetMembers.length > 0) {
                const costPerMember = parseFloat(amount) / targetMembers.length;
                
                // Deduct from each member's balance and create logs
                for (const member of targetMembers) {
                    const newBalance = member.balance - costPerMember;
                    await databases.updateDocument(DB_ID, COLL_MEMBERS, member.$id, {
                        balance: newBalance
                    });
                    
                    // Log the deduction for this member
                    const expenseLabel = distributionMethod === 'coowners' 
                        ? `Group expense (split among co-owners): ${message}`
                        : `Group expense (split among all members): ${message}`;
                    await this.logAction('EXPENSE', -costPerMember, member.$id, member.name, expenseLabel, fileId);
                }
            }
        }

        // 4. Log the main expense action in group logs
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
                ,
                surcharge_percent: config.surcharge_percent || 50 // default 10%
            };
        } catch (error) {
            console.error("Error fetching global config:", error);
            return {
                group_funds: 0,
                grams_per_cup: 18,
                coffee_price_per_cup: 0.50,
                coffee_price_per_gram: 0.0278
                ,
                surcharge_percent: 50
            };
        }
    },

    async updateSurchargePercent(percent) {
        try {
            await databases.updateDocument(DB_ID, COLL_GLOBAL, 'main', {
                surcharge_percent: parseFloat(percent)
            });
            return true;
        } catch (error) {
            console.error('Error updating surcharge percent:', error);
            throw error;
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

            // Determine surcharge (applies when user balance is <= 0)
            let surchargeAmt = 0;
            if ((memberDoc.balance || 0) <= 0) {
                surchargeAmt = +(price * (config.surcharge_percent || 0) / 100);
                // Round to cents
                surchargeAmt = Math.round(surchargeAmt * 100) / 100;
            }

            const totalPrice = +(price + surchargeAmt);

            const newBalance = (memberDoc.balance || 0) - totalPrice;
            const newTotal = (memberDoc.total_coffees || 0) + 1;

            // Update member: balance, coffees, and accumulated surcharge total
            const updatedFields = {
                balance: newBalance,
                total_coffees: newTotal
            };

            // Keep track of surcharge money collected per user. The user will add this column to the members table.
            const prevSurcharge = parseFloat(memberDoc.surcharge_total || 0);
            if (surchargeAmt > 0) {
                updatedFields.surcharge_total = +(prevSurcharge + surchargeAmt);
            }

            await databases.updateDocument(DB_ID, COLL_MEMBERS, memberDoc.$id, updatedFields);

            // Log the coffee purchase (total amount charged)
            await this.logAction('COFFEE', -totalPrice, memberDoc.$id, memberDoc.name);

            // If there was a surcharge, log it separately for clarity
            if (surchargeAmt > 0) {
                await this.logAction('SURCHARGE', +surchargeAmt, memberDoc.$id, memberDoc.name, `Surcharge ${config.surcharge_percent}% on €${price.toFixed(2)}`);
            }

            return true;
        } catch (error) {
            console.error("Error registering coffee:", error);
            throw error;
        }
    }
};