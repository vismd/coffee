const Analytics = {
    userMember: null,
    allMembers: [],
    allLogs: [],
    groupLogs: [],
    charts: {},
    isAdmin: false,
    scatterplotSettings: {
        selectedUsers: new Set(),
        dotSize: 3,
        jitter: 0.5
    },

    getModalColors() {
        const isDarkMode = document.body.classList.contains('dark-mode');
        return {
            bg: isDarkMode ? '#2d3436' : '#ffffff',
            text: isDarkMode ? '#ffffff' : '#2d3436',
            secondaryText: isDarkMode ? '#cccccc' : '#666666',
            inputBg: isDarkMode ? '#2b2b2b' : '#ffffff',
            inputText: isDarkMode ? '#ffffff' : '#2d3436',
            inputBorder: isDarkMode ? '#555' : '#ddd'
        };
    },

    async init() {
        try {
            // Load theme preference from localStorage
            const savedTheme = localStorage.getItem('theme') || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                document.getElementById('theme-toggle').textContent = '☀️';
            }

            // Initialize session
            const sessionUser = await Auth.initSession();
            
            // Fetch user member
            this.userMember = await DB.getMemberByUid(sessionUser.$id);

            if (!this.userMember) {
                document.getElementById('app').innerHTML = `
                    <div class="card fade-in">
                        <p>No account linked to this device.</p>
                        <p><small>ID: ${sessionUser.$id}</small></p>
                    </div>`;
                return;
            }

            // Fetch all necessary data
            this.allMembers = await DB.getAllMembers();
            this.allLogs = await this.getAllLogs();
            this.groupLogs = await DB.getGroupLogs();
            this.isAdmin = await Auth.checkAdminStatus();

            // Initialize scatterplot settings with users who have coffee data selected
            const allCoffeeLogs = this.allLogs.filter(log => log.type === 'COFFEE');
            const usersWithData = new Set(allCoffeeLogs.map(log => log.userId));
            this.scatterplotSettings.selectedUsers = new Set(usersWithData);

            // Render analytics
            this.renderAnalytics();
        } catch (error) {
            console.error("Analytics Init Error:", error);
            document.getElementById('app').innerHTML = `
                <div class="card fade-in">
                    <p>Error loading analytics</p>
                </div>`;
        }
    },

    async getAllLogs() {
        try {
            const result = await databases.listDocuments(DB_ID, COLL_LOGS, [
                Appwrite.Query.orderDesc('timestamp'),
                Appwrite.Query.limit(100)
            ]);
            return result.documents;
        } catch (error) {
            console.error("Error fetching all logs:", error);
            return [];
        }
    },

    renderAnalytics() {
        this.renderMetricsPanel();
        this.renderBadges();
        this.renderUserCoffeeChart();
        this.renderGroupCoffeeChart();
        this.renderGroupPurchasesChart();
        this.renderCoffeeTimesChart();
        this.renderPurchaseBreakdownChart();
        this.renderActivityFeed();
    },

    renderMetricsPanel() {
        const container = document.getElementById('metricsPanel');
        if (!container) return;

        const userLogs = this.allLogs.filter(log => 
            log.userId === this.userMember.$id && 
            log.type === 'COFFEE'
        );

        // Calculate metrics
        const totalCost = userLogs.reduce((sum, log) => sum + Math.abs(log.amount), 0);

        // Max coffees in one day
        const coffeesByDay = {};
        userLogs.forEach(log => {
            const date = new Date(log.timestamp).toLocaleDateString();
            coffeesByDay[date] = (coffeesByDay[date] || 0) + 1;
        });
        const maxPerDay = Math.max(...Object.values(coffeesByDay), 0);

        // Max coffees in one week
        const today = new Date();
        const coffeesByWeek = [0, 0, 0, 0];
        userLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            const weekIndex = Math.floor((today.getTime() - logDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
            if (weekIndex >= 0 && weekIndex < 4) {
                coffeesByWeek[3 - weekIndex]++;
            }
        });
        const maxPerWeek = Math.max(...coffeesByWeek, 0);

        // Max coffees in one month
        const coffeesByMonth = {};
        userLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            const monthStr = logDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            coffeesByMonth[monthStr] = (coffeesByMonth[monthStr] || 0) + 1;
        });
        const maxPerMonth = Math.max(...Object.values(coffeesByMonth), 0);

        const balanceClass = this.userMember.balance < 0 ? 'negative' : 'positive';

        container.innerHTML = `
            <div class="metric-card">
                <span class="metric-label">Total Coffees</span>
                <span class="metric-value">${this.userMember.total_coffees}</span>
            </div>
            <div class="metric-card">
                <span class="metric-label">Total Spent</span>
                <span class="metric-value">€${totalCost.toFixed(2)}</span>
            </div>
            <div class="metric-card">
                <span class="metric-label">Max Per Day</span>
                <span class="metric-value">${maxPerDay}</span>
            </div>
            <div class="metric-card">
                <span class="metric-label">Max Per Week</span>
                <span class="metric-value">${maxPerWeek}</span>
            </div>
            <div class="metric-card">
                <span class="metric-label">Max Per Month</span>
                <span class="metric-value">${maxPerMonth}</span>
            </div>
            <div class="metric-card">
                <span class="metric-label">Balance</span>
                <span class="metric-value ${balanceClass}">€${this.userMember.balance.toFixed(2)}</span>
            </div>
        `;
    },

    renderBadges() {
        const container = document.getElementById('badgesPanel');
        if (!container) return;

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recentLogs = this.allLogs.filter(log => 
            log.type === 'COFFEE' && 
            new Date(log.timestamp) > sevenDaysAgo
        );

        if (recentLogs.length === 0) {
            container.innerHTML = '<p>No coffee data for the past week.</p>';
            return;
        }

        // Coffee Champion: Most coffees
        const userCounts = {};
        recentLogs.forEach(log => {
            userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
        });
        const maxCount = Math.max(...Object.values(userCounts));
        const championId = Object.keys(userCounts).find(id => userCounts[id] === maxCount);
        const championName = this.allMembers.find(m => m.$id === championId)?.name || 'Unknown';

        // Early Bird: Earliest coffee time of day
        let earliestHour = Infinity;
        let earlyBirdId = null;
        recentLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            const hour = logDate.getHours() + logDate.getMinutes() / 60;
            if (hour < earliestHour) {
                earliestHour = hour;
                earlyBirdId = log.userId;
            }
        });
        const earlyBirdName = this.allMembers.find(m => m.$id === earlyBirdId)?.name || 'Unknown';
        const earlyHour = `${Math.floor(earliestHour)}:${Math.round((earliestHour % 1) * 60).toString().padStart(2, '0')}`;

        // Night Owl: Latest coffee time of day
        let latestHour = -Infinity;
        let nightOwlId = null;
        recentLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            const hour = logDate.getHours() + logDate.getMinutes() / 60;
            if (hour > latestHour) {
                latestHour = hour;
                nightOwlId = log.userId;
            }
        });
        const nightOwlName = this.allMembers.find(m => m.$id === nightOwlId)?.name || 'Unknown';
        const lateHour = `${Math.floor(latestHour)}:${Math.round((latestHour % 1) * 60).toString().padStart(2, '0')}`;

        // Weekend Warrior: Most coffees on weekends
        const weekendLogs = recentLogs.filter(log => {
            const day = new Date(log.timestamp).getDay();
            return day === 0 || day === 6; // Sunday or Saturday
        });
        const weekendCounts = {};
        weekendLogs.forEach(log => {
            weekendCounts[log.userId] = (weekendCounts[log.userId] || 0) + 1;
        });
        const maxWeekend = weekendCounts ? Math.max(...Object.values(weekendCounts)) : 0;
        const warriorId = maxWeekend > 0 ? Object.keys(weekendCounts).find(id => weekendCounts[id] === maxWeekend) : null;
        const warriorName = warriorId ? this.allMembers.find(m => m.$id === warriorId)?.name || 'Unknown' : 'No one';

        let badgesHTML = `
            <h3 style="margin-bottom: 15px; color: var(--text); font-size: 1.2rem;">🏆 Weekly Champions (Last 7 Days)</h3>
            <div class="badges-container">
                <div class="badge">
                    <h3>🏆 Coffee Champion</h3>
                    <p>${championName}<br>${maxCount} coffees</p>
                </div>
                <div class="badge">
                    <h3>🐦 Early Bird</h3>
                    <p>${earlyBirdName}<br>${earlyHour}</p>
                </div>
                <div class="badge">
                    <h3>🦉 Night Owl</h3>
                    <p>${nightOwlName}<br>${lateHour}</p>
                </div>`;

        if (maxWeekend > 0) {
            badgesHTML += `
                <div class="badge">
                    <h3>⚔️ Weekend Warrior</h3>
                    <p>${warriorName}<br>${maxWeekend} weekend coffees</p>
                </div>`;
        }

        badgesHTML += `
            </div>
        `;

        container.innerHTML = badgesHTML;
    },

    getChartColors() {
        const isDarkMode = document.body.classList.contains('dark-mode');
        return {
            backgroundColor: [
                '#497ea7',
                '#ff7675',
                '#fdcb6e',
                '#6c5ce7',
                '#00b894',
                '#e17055',
                '#0984e3',
                '#74b9ff'
            ],
            borderColor: isDarkMode ? '#555' : '#999',
            textColor: isDarkMode ? '#e8e8e8' : '#1a1a1a',
            gridColor: isDarkMode ? '#444' : '#ccc'
        };
    },

    renderUserCoffeeChart() {
        const ctx = document.getElementById('userCoffeeChart');
        if (!ctx) return;

        // Calculate user's coffee consumption by weekday (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const userLogs = this.allLogs.filter(log => 
            log.userId === this.userMember.$id && 
            log.type === 'COFFEE' &&
            new Date(log.timestamp) >= thirtyDaysAgo
        );

        // Group by weekday (Monday = 0, Sunday = 6)
        const weekdayData = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
        const weekdayOccurrences = [0, 0, 0, 0, 0, 0, 0]; // How many times each weekday occurred
        const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        // Count occurrences of each weekday in the 30-day period
        for (let i = 0; i < 30; i++) {
            const date = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
            const dayOfWeek = (date.getDay() + 6) % 7; // Convert Sun=0 to Mon=0
            weekdayOccurrences[dayOfWeek]++;
        }

        userLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            const dayOfWeek = (logDate.getDay() + 6) % 7; // Convert Sun=0 to Mon=0
            weekdayData[dayOfWeek]++;
        });

        // Check if there are weekend entries (Saturday = 5, Sunday = 6)
        const hasWeekendData = weekdayData[5] > 0 || weekdayData[6] > 0;
        
        let filteredLabels, filteredData, filteredOccurrences;
        if (hasWeekendData) {
            // Show only Saturday and Sunday
            filteredLabels = ['Saturday', 'Sunday'];
            filteredData = [weekdayData[5], weekdayData[6]];
            filteredOccurrences = [weekdayOccurrences[5], weekdayOccurrences[6]];
        } else {
            // Show weekdays only (Monday to Friday)
            filteredLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
            filteredData = weekdayData.slice(0, 5);
            filteredOccurrences = weekdayOccurrences.slice(0, 5);
        }

        // Calculate averages
        const avgData = filteredData.map((total, index) => {
            const occurrences = filteredOccurrences[index];
            return occurrences > 0 ? (total / occurrences).toFixed(1) : '0.0';
        });

        const colors = this.getChartColors();

        this.charts.userCoffee = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: filteredLabels,
                datasets: [{
                    label: 'Avg Coffees Per Weekday',
                    data: avgData,
                    backgroundColor: colors.backgroundColor[0],
                    borderColor: colors.backgroundColor[0],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: colors.textColor }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: colors.textColor },
                        grid: { color: colors.gridColor }
                    },
                    x: {
                        ticks: { color: colors.textColor },
                        grid: { display: false }
                    }
                }
            }
        });
    },

    renderGroupCoffeeChart() {
        const ctx = document.getElementById('groupCoffeeChart');
        if (!ctx) return;

        // Get top 8 members by coffee consumption
        const memberCoffeeCount = {};
        this.allMembers.forEach(member => {
            memberCoffeeCount[member.$id] = member.total_coffees;
        });

        const sortedMembers = this.allMembers
            .sort((a, b) => memberCoffeeCount[b.$id] - memberCoffeeCount[a.$id])
            .slice(0, 8);

        const labels = sortedMembers.map(m => m.name);
        const data = sortedMembers.map(m => m.total_coffees);
        const colors = this.getChartColors();

        this.charts.groupCoffee = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Coffees',
                    data: data,
                    backgroundColor: colors.backgroundColor.slice(0, labels.length),
                    borderColor: colors.backgroundColor.slice(0, labels.length),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: colors.textColor }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: colors.textColor },
                        grid: { color: colors.gridColor }
                    },
                    y: {
                        ticks: { color: colors.textColor },
                        grid: { display: false }
                    }
                }
            }
        });
    },

    renderGroupPurchasesChart() {
        const ctx = document.getElementById('groupPurchasesChart');
        if (!ctx) return;

        // Get purchases over time (last 12 months)
        const today = new Date();
        const twelveMonthsAgo = new Date(today.getFullYear() - 1, today.getMonth(), 1);

        const purchasesByMonth = {};
        const labels = [];
        
        // Initialize months
        for (let i = 11; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthStr = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            labels.push(monthStr);
            purchasesByMonth[monthStr] = 0;
        }

        this.groupLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            if (logDate >= twelveMonthsAgo) {
                const monthStr = logDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                if (purchasesByMonth.hasOwnProperty(monthStr)) {
                    purchasesByMonth[monthStr] += Math.abs(log.amount);
                }
            }
        });

        const data = labels.map(label => purchasesByMonth[label]);
        const colors = this.getChartColors();

        this.charts.groupPurchases = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Monthly Spending (€)',
                    data: data,
                    borderColor: colors.backgroundColor[1],
                    backgroundColor: colors.backgroundColor[1] + '30',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: colors.textColor }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: colors.textColor,
                            callback: (value) => '€' + value.toFixed(2)
                        },
                        grid: { color: colors.gridColor }
                    },
                    x: {
                        ticks: { color: colors.textColor },
                        grid: { color: colors.gridColor }
                    }
                }
            }
        });
    },

    renderCoffeeTimesChart() {
        const ctx = document.getElementById('spendingChart');
        if (!ctx) return;

        // Destroy existing chart if it exists
        if (this.charts.coffeetimes) {
            this.charts.coffeetimes.destroy();
        }

        // Get all coffee logs for all users
        const allCoffeeLogs = this.allLogs.filter(log => log.type === 'COFFEE');

        // Group logs by user
        const logsByUser = {};
        allCoffeeLogs.forEach(log => {
            if (!logsByUser[log.userId]) {
                logsByUser[log.userId] = [];
            }
            logsByUser[log.userId].push(log);
        });

        // Filter to only selected users
        const filteredLogsByUser = {};
        Object.keys(logsByUser).forEach(userId => {
            if (this.scatterplotSettings.selectedUsers.has(userId)) {
                filteredLogsByUser[userId] = logsByUser[userId];
            }
        });

        // Create datasets for each user with jitter
        const colors = this.getChartColors();
        let allHours = [];
        const datasets = Object.keys(filteredLogsByUser).map((userId, index) => {
            const userLogs = filteredLogsByUser[userId];
            const scatterData = userLogs.map(log => {
                const logDate = new Date(log.timestamp);
                const weekday = (logDate.getDay() + 6) % 7; // Convert Sun=0 to Mon=0
                const hour = logDate.getHours() + logDate.getMinutes() / 60;
                const jitter = (Math.random() - 0.5) * this.scatterplotSettings.jitter;
                
                allHours.push(hour);
                
                return {
                    x: weekday + jitter,
                    y: hour
                };
            });

            // Find user name
            const userName = userLogs[0]?.userName || 'Unknown';
            const color = colors.backgroundColor[index % colors.backgroundColor.length];
            const rgbaColor = color.replace('rgb', 'rgba').replace(')', ', 0.6)');
            const borderColor = color;

            return {
                label: userName,
                data: scatterData,
                backgroundColor: rgbaColor,
                borderColor: borderColor,
                borderWidth: 2,
                pointRadius: this.scatterplotSettings.dotSize,
                pointHoverRadius: this.scatterplotSettings.dotSize + 2
            };
        });

        // Calculate min and max hours
        const minHour = Math.min(...allHours);
        const maxHour = Math.max(...allHours);
        const yMin = Math.max(0, Math.floor(minHour) - 1);
        const yMax = Math.min(24, Math.ceil(maxHour) + 1);

        const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        this.charts.coffeetimes = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: colors.textColor }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: -0.5,
                        max: 6.5,
                        ticks: {
                            callback: function(value) {
                                return weekdayLabels[Math.round(value)];
                            },
                            stepSize: 1,
                            color: colors.textColor
                        },
                        grid: {
                            color: colors.gridColor
                        },
                        title: {
                            display: true,
                            text: 'Day of Week',
                            color: colors.textColor
                        }
                    },
                    y: {
                        min: yMin,
                        max: yMax,
                        ticks: {
                            callback: function(value) {
                                const hours = Math.floor(value);
                                const mins = Math.round((value - hours) * 60);
                                return `${hours}:${mins.toString().padStart(2, '0')}`;
                            },
                            stepSize: 1,
                            color: colors.textColor
                        },
                        grid: {
                            color: colors.gridColor
                        },
                        title: {
                            display: true,
                            text: 'Time of Day',
                            color: colors.textColor
                        }
                    }
                }
            }
        });
    },

    renderPurchaseBreakdownChart() {
        const ctx = document.getElementById('purchaseBreakdownChart');
        if (!ctx) return;

        // Analyze purchase messages for categories
        const categories = {};
        this.groupLogs.forEach(log => {
            const message = (log.message || 'Other').toLowerCase();
            let category = 'Other';
            
            if (message.includes('beans')) category = 'Coffee Beans';
            else if (message.includes('machine') || message.includes('equipment')) category = 'Equipment';
            else if (message.includes('milk') || message.includes('cream')) category = 'Milk/Cream';
            else if (message.includes('sugar') || message.includes('sweetener')) category = 'Sugar/Sweetener';
            else if (message.includes('cup') || message.includes('filter')) category = 'Supplies';
            else if (message.includes('coffee')) category = 'Coffee';

            categories[category] = (categories[category] || 0) + Math.abs(log.amount);
        });

        const labels = Object.keys(categories);
        const data = Object.values(categories);
        const colors = this.getChartColors();

        this.charts.breakdown = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Spending by Category (€)',
                    data: data,
                    backgroundColor: colors.backgroundColor.slice(0, labels.length),
                    borderColor: document.body.classList.contains('dark-mode') ? '#2d2d2d' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: colors.textColor }
                    }
                }
            }
        });
    },

    isActivityVisibleToUser(log) {
        // Group activities (always visible)
        if (['EXPENSE', 'BEANS'].includes(log.type)) {
            return true;
        }
        
        // User's own activities (always visible)
        if (log.userId === this.userMember.$id) {
            return true;
        }
        
        return false;
    },

    renderActivityFeed() {
        const container = document.getElementById('activityFeed');
        if (!container) return;

        let filteredLogs = this.allLogs;
        
        // If not admin, filter to show only relevant activities
        if (!this.isAdmin) {
            filteredLogs = this.allLogs.filter(log => this.isActivityVisibleToUser(log));
        }
        
        const recentLogs = filteredLogs.slice(0, 15);
        const html = recentLogs.map(log => {
            const date = new Date(log.timestamp);
            const dateStr = date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric'
            });
            const timeStr = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const typeEmoji = log.type === 'COFFEE' ? '☕' : log.type === 'EXPENSE' ? '💰' : log.type === 'BEANS' ? '🫘' : log.type === 'TOPUP' ? '💵' : '⚙️';
            const isUser = log.userId === this.userMember.$id;
            const isVisible = this.isActivityVisibleToUser(log);
            const isHidden = this.isAdmin && !isVisible;
            const message = log.message ? log.message : '';
            
            return `
                <div class="activity-item ${isUser ? 'user-activity' : ''} ${isHidden ? 'hidden-activity' : ''}">
                    <span class="activity-emoji">${typeEmoji}</span>
                    <div class="activity-content">
                        <div class="activity-header">
                            <span class="activity-user">${log.userName}</span>
                            <span class="activity-type">${log.type}</span>
                        </div>
                        ${message ? `<div class="activity-desc">${message}</div>` : ''}
                        <div class="activity-meta">
                            <span class="activity-time">${dateStr} at ${timeStr}</span>
                            <span class="activity-amount ${log.amount < 0 ? 'negative' : 'positive'}">
                                ${log.amount < 0 ? '−' : '+'}€${Math.abs(log.amount).toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html || '<p>No activity yet</p>';
    },

    showScatterplotSettingsModal() {
        // Check if modal already exists
        if (document.getElementById('scatterplot-settings-modal')) return;

        const colors = this.getModalColors();
        
        // Get all coffee logs for all users
        const allCoffeeLogs = this.allLogs.filter(log => log.type === 'COFFEE');
        
        // Group logs by user to find users with data
        const logsByUser = {};
        allCoffeeLogs.forEach(log => {
            if (!logsByUser[log.userId]) {
                logsByUser[log.userId] = [];
            }
            logsByUser[log.userId].push(log);
        });
        
        // Filter members to only include those with coffee data
        const membersWithData = this.allMembers.filter(member => logsByUser[member.$id]);
        
        const userCheckboxes = membersWithData.map(member => {
            const isChecked = this.scatterplotSettings.selectedUsers.has(member.$id);
            return `
                <label style="display:grid; grid-template-columns: 1fr auto; align-items:center; cursor:pointer; color:${colors.text}; margin-bottom:8px; gap:10px;">
                    <span>${member.name}</span>
                    <input type="checkbox" value="${member.$id}" ${isChecked ? 'checked' : ''} style="margin:0;">
                </label>
            `;
        }).join('');

        const modalHtml = `
            <div class="modal-overlay" id="scatterplot-settings-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999;">
                <div class="card modal" style="background:${colors.bg}; color:${colors.text}; padding:30px; border-radius:24px; max-width:450px; width:90%;">
                    <h3 style="margin-top:0; color:${colors.text}">Scatterplot Settings</h3>
                    
                    <div style="margin-bottom:20px;">
                        <label style="display:block; margin-bottom:10px; font-weight:600; color:${colors.text};">Select Users to Display:</label>
                        <div style="border-radius:8px; padding:10px; background:${colors.inputBg};">
                            ${userCheckboxes}
                        </div>
                    </div>
                    
                    <div style="margin-bottom:20px;">
                        <label style="display:block; margin-bottom:10px; font-weight:600; color:${colors.text};">Dot Size: <span id="dot-size-value">${this.scatterplotSettings.dotSize}</span></label>
                        <input type="range" id="dot-size-slider" min="1" max="15" value="${this.scatterplotSettings.dotSize}" style="width:100%;">
                    </div>
                    
                    <div style="margin-bottom:20px;">
                        <label style="display:block; margin-bottom:10px; font-weight:600; color:${colors.text};">Jitter: <span id="jitter-value">${this.scatterplotSettings.jitter}</span></label>
                        <input type="range" id="jitter-slider" min="0" max="1" step="0.1" value="${this.scatterplotSettings.jitter}" style="width:100%;">
                    </div>
                    
                    <div style="display:flex; gap:10px;">
                        <button onclick="Analytics.applyScatterplotSettings()" class="btn-primary" style="flex:2">Apply</button>
                        <button onclick="document.getElementById('scatterplot-settings-modal').remove()" class="btn-cancel" style="flex:1">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Add event listener for live dot size preview
        const slider = document.getElementById('dot-size-slider');
        const valueDisplay = document.getElementById('dot-size-value');
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
        });

        // Add event listener for live jitter preview
        const jitterSlider = document.getElementById('jitter-slider');
        const jitterValueDisplay = document.getElementById('jitter-value');
        jitterSlider.addEventListener('input', (e) => {
            jitterValueDisplay.textContent = e.target.value;
        });
    },

    applyScatterplotSettings() {
        // Update selected users
        const checkboxes = document.querySelectorAll('#scatterplot-settings-modal input[type="checkbox"]');
        this.scatterplotSettings.selectedUsers.clear();
        checkboxes.forEach(cb => {
            if (cb.checked) {
                this.scatterplotSettings.selectedUsers.add(cb.value);
            }
        });

        // Update dot size
        const dotSize = parseInt(document.getElementById('dot-size-slider').value);
        this.scatterplotSettings.dotSize = dotSize;

        // Update jitter
        const jitter = parseFloat(document.getElementById('jitter-slider').value);
        this.scatterplotSettings.jitter = jitter;

        // Re-render the chart
        Analytics.renderCoffeeTimesChart();

        // Close modal
        document.getElementById('scatterplot-settings-modal').remove();
    }
};

window.toggleTheme = () => {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    document.getElementById('theme-toggle').textContent = isDarkMode ? '☀️' : '🌙';
    
    // Redraw charts with new colors
    Analytics.renderAnalytics();
};

window.onload = () => Analytics.init();
