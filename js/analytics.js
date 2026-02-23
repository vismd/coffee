const Analytics = {
    userMember: null,
    allMembers: [],
    allLogs: [],
    groupLogs: [],
    charts: {},

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
        this.renderUserCoffeeChart();
        this.renderGroupCoffeeChart();
        this.renderGroupPurchasesChart();
        this.renderSpendingChart();
        this.renderPurchaseBreakdownChart();
        this.renderActivityFeed();
        this.renderUserStats();
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
            borderColor: isDarkMode ? '#444' : '#ddd',
            textColor: isDarkMode ? '#e8e8e8' : '#2d3436',
            gridColor: isDarkMode ? '#444' : '#ddd'
        };
    },

    renderUserCoffeeChart() {
        const ctx = document.getElementById('userCoffeeChart');
        if (!ctx) return;

        // Calculate user's coffee consumption trend (last 30 days, grouped by week)
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const userLogs = this.allLogs.filter(log => 
            log.userId === this.userMember.$id && 
            log.type === 'COFFEE' &&
            new Date(log.timestamp) >= thirtyDaysAgo
        );

        // Group by week
        const weeks = [{}, {}, {}, {}];
        const weekLabels = [];
        for (let i = 3; i >= 0; i--) {
            const weekStart = new Date(today.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
            weekLabels.push(`Week ${4 - i}`);
        }

        userLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            const weekIndex = Math.floor((today.getTime() - logDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
            if (weekIndex >= 0 && weekIndex < 4) {
                weeks[3 - weekIndex]++;
            }
        });

        const data = [
            weeks[0] || 0,
            weeks[1] || 0,
            weeks[2] || 0,
            weeks[3] || 0
        ];

        const colors = this.getChartColors();

        this.charts.userCoffee = new Chart(ctx, {
            type: 'line',
            data: {
                labels: weekLabels,
                datasets: [{
                    label: 'Coffees Per Week',
                    data: data,
                    borderColor: colors.backgroundColor[0],
                    backgroundColor: colors.backgroundColor[0] + '20',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: colors.backgroundColor[0],
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
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
                        grid: { color: colors.gridColor }
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
                maintainAspectRatio: true,
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

        // Get purchases over time (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        const purchasesByDay = {};
        const labels = [];
        for (let i = 0; i < 30; i++) {
            const date = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            labels.push(dateStr);
            purchasesByDay[dateStr] = 0;
        }

        this.groupLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            if (logDate >= thirtyDaysAgo) {
                const dateStr = logDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (purchasesByDay.hasOwnProperty(dateStr)) {
                    purchasesByDay[dateStr] += Math.abs(log.amount);
                }
            }
        });

        const data = labels.map(label => purchasesByDay[label]);
        const colors = this.getChartColors();

        this.charts.groupPurchases = new Chart(ctx, {
            type: 'area',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Spending (€)',
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
                maintainAspectRatio: true,
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

    renderSpendingChart() {
        const ctx = document.getElementById('spendingChart');
        if (!ctx) return;

        // Calculate balance trends for all members
        const memberSpending = {};
        this.allMembers.forEach(member => {
            memberSpending[member.name] = Math.abs(member.balance);
        });

        const sortedMembers = Object.entries(memberSpending)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        const labels = sortedMembers.map(m => m[0]);
        const data = sortedMembers.map(m => m[1]);
        const colors = this.getChartColors();

        this.charts.spending = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Outstanding Balance (€)',
                    data: data,
                    backgroundColor: colors.backgroundColor.slice(0, labels.length),
                    borderColor: document.body.classList.contains('dark-mode') ? '#2d2d2d' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        labels: { color: colors.textColor }
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
            
            if (message.includes('coffee') || message.includes('beans')) category = 'Coffee Beans';
            else if (message.includes('milk') || message.includes('cream')) category = 'Milk/Cream';
            else if (message.includes('sugar') || message.includes('sweetener')) category = 'Sugar/Sweetener';
            else if (message.includes('cup') || message.includes('filter')) category = 'Supplies';
            else if (message.includes('machine') || message.includes('equipment')) category = 'Equipment';

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
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        labels: { color: colors.textColor }
                    }
                }
            }
        });
    },

    renderActivityFeed() {
        const container = document.getElementById('activityFeed');
        if (!container) return;

        const recentLogs = this.allLogs.slice(0, 15);
        const html = recentLogs.map(log => {
            const date = new Date(log.timestamp);
            const dateStr = date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const typeEmoji = log.type === 'COFFEE' ? '☕' : '💰';
            const isUser = log.userId === this.userMember.$id;
            
            return `
                <div class="activity-item ${isUser ? 'user-activity' : ''}">
                    <span class="activity-emoji">${typeEmoji}</span>
                    <div class="activity-details">
                        <span class="activity-user"><b>${log.userName}</b></span>
                        <span class="activity-type">${log.type}</span>
                        ${log.message ? `<span class="activity-message">${log.message}</span>` : ''}
                    </div>
                    <span class="activity-time">${dateStr}</span>
                    <span class="activity-amount ${log.amount < 0 ? 'negative' : 'positive'}">
                        ${log.amount < 0 ? '' : '+'}€${Math.abs(log.amount).toFixed(2)}
                    </span>
                </div>
            `;
        }).join('');

        container.innerHTML = html || '<p>No activity yet</p>';
    },

    renderUserStats() {
        const container = document.getElementById('userStatsText');
        if (!container) return;

        const userLogs = this.allLogs.filter(log => 
            log.userId === this.userMember.$id && 
            log.type === 'COFFEE'
        );

        const totalCost = userLogs.reduce((sum, log) => sum + Math.abs(log.amount), 0);
        const avgPerWeek = (this.userMember.total_coffees / 4.29).toFixed(1); // Average weeks in a month

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Total Coffees</span>
                    <span class="stat-value">${this.userMember.total_coffees}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Spent</span>
                    <span class="stat-value">€${totalCost.toFixed(2)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Per Week Avg</span>
                    <span class="stat-value">${avgPerWeek}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Current Balance</span>
                    <span class="stat-value ${this.userMember.balance < 0 ? 'negative' : 'positive'}">
                        €${this.userMember.balance.toFixed(2)}
                    </span>
                </div>
            </div>
        `;
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
