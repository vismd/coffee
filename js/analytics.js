const Analytics = {
    userMember: null,
    allMembers: [],
    allLogs: [],
    groupLogs: [],
    charts: {},
    isAdmin: false,

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
        this.renderUserCoffeeChart();
        this.renderGroupCoffeeChart();
        this.renderGroupPurchasesChart();
        this.renderSpendingChart();
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

        // Group by weekday
        const weekdayData = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
        const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
        const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        userLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            const dayOfWeek = logDate.getDay();
            weekdayData[dayOfWeek]++;
            weekdayCount[dayOfWeek]++;
        });

        // Calculate averages
        const avgData = weekdayData.map((total, index) => {
            const weeksInPeriod = 4; // Approximate
            return (total / weeksInPeriod).toFixed(1);
        });

        const colors = this.getChartColors();

        this.charts.userCoffee = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weekdayLabels,
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
