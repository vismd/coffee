const DB = {
    // Compress image for better performance while maintaining readability
    async compressImage(file) {
        return new Promise((resolve, reject) => {
            // Only compress image files
            if (!file.type.startsWith('image/')) {
                resolve(file);
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    
                    // Max dimensions for readability
                    const maxWidth = 1200;
                    const maxHeight = 1200;
                    let width = img.width;
                    let height = img.height;
                    
                    // Scale down if needed
                    if (width > height) {
                        if (width > maxWidth) {
                            height *= maxWidth / width;
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width *= maxHeight / height;
                            height = maxHeight;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convert to blob with compression
                    canvas.toBlob(
                        (blob) => {
                            // Create a new File object from the blob
                            const compressedFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(compressedFile);
                        },
                        'image/jpeg',
                        0.75 // Quality 75% - good balance between size and readability
                    );
                };
                img.onerror = () => {
                    // If image fails to load, use original file
                    resolve(file);
                };
                img.src = event.target.result;
            };
            reader.onerror = () => {
                // If file read fails, use original file
                resolve(file);
            };
            reader.readAsDataURL(file);
        });
    },

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
            Appwrite.Query.equal('userId', 'ADMIN'),
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

        // 1. If the admin selected a photo, compress and upload it
        if (file) {
            try {
                // Compress the image before uploading
                const compressedFile = await this.compressImage(file);
                
                const uploadedFile = await storage.createFile(
                    BUCKET_ID,          // Must match the ID in Appwrite Storage
                    Appwrite.ID.unique(), 
                    compressedFile
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
            
            // 1. Upload receipt file if provided - compress image first
            if (file) {
                try {
                    // Compress the image before uploading
                    const compressedFile = await this.compressImage(file);
                    
                    const uploadedFile = await storage.createFile(
                        BUCKET_ID,
                        Appwrite.ID.unique(),
                        compressedFile
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
            const logMessage = `Coffee Beans: ${grams}g (€${pricePerCup.toFixed(2)}/cup)`;
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
            const coffeeLog = await this.logAction('COFFEE', -totalPrice, memberDoc.$id, memberDoc.name);

            // If there was a surcharge, log it separately for clarity
            let surchargeLog = null;
            if (surchargeAmt > 0) {
                surchargeLog = await this.logAction('SURCHARGE', +surchargeAmt, memberDoc.$id, memberDoc.name, `Surcharge ${config.surcharge_percent}% on €${price.toFixed(2)}`);
            }

            return {
                memberId: memberDoc.$id,
                expiresAt: Date.now() + 10000,
                used: false,
                previous: {
                    balance: memberDoc.balance || 0,
                    total_coffees: memberDoc.total_coffees || 0,
                    ...((Object.prototype.hasOwnProperty.call(memberDoc, 'surcharge_total') || surchargeAmt > 0)
                        ? { surcharge_total: prevSurcharge }
                        : {})
                },
                expected: {
                    balance: newBalance,
                    total_coffees: newTotal,
                    ...((Object.prototype.hasOwnProperty.call(memberDoc, 'surcharge_total') || surchargeAmt > 0)
                        ? { surcharge_total: surchargeAmt > 0 ? +(prevSurcharge + surchargeAmt) : prevSurcharge }
                        : {})
                },
                logIds: [coffeeLog?.$id, surchargeLog?.$id].filter(Boolean)
            };
        } catch (error) {
            console.error("Error registering coffee:", error);
            throw error;
        }
    },

    async undoCoffeeRegistration(transaction) {
        if (!transaction || transaction.used || Date.now() > transaction.expiresAt) {
            throw new Error('This undo action has expired.');
        }

        const current = await databases.getDocument(DB_ID, COLL_MEMBERS, transaction.memberId);
        const balanceMatches = Math.abs(Number(current.balance) - Number(transaction.expected.balance)) < 0.001;
        const totalMatches = Number(current.total_coffees) === Number(transaction.expected.total_coffees);
        const tracksSurcharge = Object.prototype.hasOwnProperty.call(transaction.expected, 'surcharge_total');
        const surchargeMatches = !tracksSurcharge || Math.abs(Number(current.surcharge_total || 0) - Number(transaction.expected.surcharge_total || 0)) < 0.001;
        if (!balanceMatches || !totalMatches || !surchargeMatches) {
            throw new Error('The member balance changed after this coffee was registered.');
        }

        await databases.updateDocument(DB_ID, COLL_MEMBERS, transaction.memberId, transaction.previous);
        try {
            await Promise.all(transaction.logIds.map(logId => databases.deleteDocument(DB_ID, COLL_LOGS, logId)));
        } catch (error) {
            await databases.updateDocument(DB_ID, COLL_MEMBERS, transaction.memberId, transaction.expected).catch(() => {});
            throw error;
        }
        transaction.used = true;
        return true;
    },

    // Get all co-owners sorted alphabetically
    async getCoowners() {
        try {
            const members = await this.getAllMembers();
            return members
                .filter(m => m.is_coowner === true)
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error("Error fetching co-owners:", error);
            return [];
        }
    },

    // Get current descaling state
    async getDescaleState() {
        try {
            const config = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
            return {
                last_descale_person: config.last_descale_person || null,
                last_descale_date: config.last_descale_date || null,
                next_descale_person: config.next_descale_person || null,
                next_descale_person_id: config.next_descale_person_id || null,
                descale_notification_mode: config.descale_notification_mode || false
            };
        } catch (error) {
            console.error("Error fetching descale state:", error);
            return {
                last_descale_person: null,
                last_descale_date: null,
                next_descale_person: null,
                next_descale_person_id: null,
                descale_notification_mode: false
            };
        }
    },

    // Record a descaling event and advance the rotation
    async recordDescaling(personName, personId) {
        try {
            // Get co-owners to determine next person
            const coowners = await this.getCoowners();
            if (coowners.length === 0) throw new Error("No co-owners found");

            // Find index of current person
            const currentIndex = coowners.findIndex(co => co.$id === personId);
            const nextIndex = (currentIndex + 1) % coowners.length;
            const nextPerson = coowners[nextIndex];

            // Update global config with new descaling state
            const config = await databases.getDocument(DB_ID, COLL_GLOBAL, 'main');
            await databases.updateDocument(DB_ID, COLL_GLOBAL, 'main', {
                last_descale_person: personName,
                last_descale_date: new Date().toISOString(),
                next_descale_person: nextPerson.name,
                next_descale_person_id: nextPerson.$id,
                descale_notification_mode: false // Auto-disable notification mode
            });

            // Log the descaling event
            return await this.logAction('DESCALE', 0, personId, personName, 'Descaled the coffee machine');
        } catch (error) {
            console.error("Error recording descaling:", error);
            throw error;
        }
    },

    // Toggle descaling notification mode
    async toggleDescaleNotificationMode(enable) {
        try {
            await databases.updateDocument(DB_ID, COLL_GLOBAL, 'main', {
                descale_notification_mode: enable
            });
            return true;
        } catch (error) {
            console.error("Error toggling notification mode:", error);
            throw error;
        }
    },

    // Manually set the next person to descale (admin override)
    async setNextDescalePerson(personName, personId) {
        try {
            await databases.updateDocument(DB_ID, COLL_GLOBAL, 'main', {
                next_descale_person: personName,
                next_descale_person_id: personId
            });
            return true;
        } catch (error) {
            console.error("Error setting next descale person:", error);
            throw error;
        }
    }
};
