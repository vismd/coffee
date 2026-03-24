const UI = {
    renderUserStats(member, coffeePrice = 0.50, surchargePercent = 10) {
        const coownerBadge = member.is_coowner ? '<span class="coowner-badge">CO-OWNER</span>' : '';
        return `
            <div class="card welcome-card">
                    <div class="welcome-header">
                    <h2>Welcome, ${member.name}${coownerBadge}</h2>
                    <button class="btn-qr" onclick="window.showClaimQR('${member.$id}')" title="Share identification code">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <rect x="3" y="3" width="6" height="6" />
                            <rect x="15" y="3" width="6" height="6" />
                            <rect x="3" y="15" width="6" height="6" />
                            <rect x="11" y="11" width="2" height="2" />
                            <rect x="17" y="11" width="2" height="2" />
                            <rect x="11" y="17" width="2" height="2" />
                        </svg>
                    </button>
                </div>
                <div class="stat-grid">
                    <div class="stat"><span>Balance</span> <b>€${member.balance.toFixed(2)}</b></div>
                    <div class="stat"><span>Coffees</span> <b>${member.total_coffees}</b></div>
                </div>
                ${member.balance < 5 ? `
                    <div class="low-balance-notice" style="background:#FF8775;border-left:4px solid #FF2F0F;padding:10px;border-radius:6px;margin-bottom:10px;display:flex;flex-direction:column;align-items:stretch;gap:8px;"> 
                        <div style="color:#fff; width:100%; text-align:center;">There will be a surcharge of <b>€${(Math.round((coffeePrice * (surchargePercent||0) / 100) * 100)/100).toFixed(2)}</b> per coffee when your balance goes negative.<br><b>Please top up your account.</b></div>
                        <div style="display:flex;gap:8px; width:100%; justify-content:flex-end;">
                            <button class="btn-primary" onclick="window.showTopupInfoModal()" style="white-space:nowrap;">How to top up</button>
                        </div>
                    </div>
                ` : ''}

                <button onclick="window.handleCoffee()" class="btn-primary">☕ Get Coffee ( €${coffeePrice.toFixed(2)}${(member.balance <= 0) ? `<span style=\"color:#ff3b30; margin-left:6px; font-weight:600;\">+ €${(Math.round((coffeePrice * (surchargePercent||0) / 100) * 100)/100).toFixed(2)}</span>` : ''} )</button>
            </div>
        `;
    },

    renderAdminPanel(members, groupFunds, descaleState = {}) {
        const rows = members.map(m => {
            const coownerBadge = m.is_coowner ? '<span class="coowner-badge">CO-OWNER</span>' : '';
            return `
            <div class="member-row">
                <span class="member-name">${m.name}${coownerBadge}</span>
                <span class="member-balance ${m.balance < 0 ? 'neg' : 'pos'}">
                    €${m.balance.toFixed(2)}
                </span>
                <div style="display:flex; gap:6px; align-items:center;">
                                    <button class="btn-qr" title="Show claim QR" onclick="window.showClaimQR('${m.$id}')">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                                <rect x="3" y="3" width="6" height="6" />
                                                <rect x="15" y="3" width="6" height="6" />
                                                <rect x="3" y="15" width="6" height="6" />
                                                <rect x="11" y="11" width="2" height="2" />
                                                <rect x="17" y="11" width="2" height="2" />
                                                <rect x="11" y="17" width="2" height="2" />
                                        </svg>
                                    </button>
                  <button class="btn-topup" onclick="window.showAddFunds('${m.$id}')">+</button>
                </div>
            </div>
        `;
        }).join('');
        
        // Format last descaling date
        let lastDescaleHtml = '<em style="opacity:0.6;">No descaling yet</em>';
        if (descaleState.last_descale_date) {
            const date = new Date(descaleState.last_descale_date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            lastDescaleHtml = `<b>${descaleState.last_descale_person}</b> on <span style="opacity:0.8;">${dateStr}</span>`;
        }

                // THIS IS THE MISSING PIECE:
                return `
                        <div class="card admin-card fade-in">
                                <div class="group-pot">
                                    <p>Collective Pot</p>
                                    <h2>€${(groupFunds || 0).toFixed(2)}</h2>
                                </div>
                                <div style="margin-top:12px; display:flex; gap:10px; flex-wrap: wrap;">
                                                    <button class="btn-primary" onclick="window.showExpenseModal()">Record Group Purchase</button>
                                                    <button class="btn-primary" onclick="window.showCoffeeBeanModal()" style="background: #6c5ce7;">🫘 Buy Coffee Beans</button>
                                                    <button class="btn-primary" onclick="window.showDescalingModal()" style="background: #a29bfe;">🧪 Record Descaling</button>
                                                    <button class="btn-primary" onclick="window.showGramsConfigModal()" style="background: #00b894;">⚙️ Config Cup Weight</button>
                                                    <button class="btn-primary" onclick="window.showSurchargeConfigModal()" style="background:#ff7675">⚖️ Configure Surcharge</button>
                                                </div>
                                
                                <div style="margin-top:16px; padding:14px; background:rgba(162, 155, 254, 0.08); border-left:3px solid #a29bfe; border-radius:6px; color:var(--text);">
                                    <div style="margin-bottom:12px;">
                                        <div style="font-size:0.8rem; opacity:0.7; margin-bottom:4px;">Last Descaled:</div>
                                        <div style="font-size:0.95rem;">${lastDescaleHtml}</div>
                                    </div>
                                    <div style="margin-bottom:12px;">
                                        <div style="font-size:0.8rem; opacity:0.7; margin-bottom:4px;">Next to Descale:</div>
                                        <div style="font-size:0.95rem;"><b>${descaleState.next_descale_person || '?'}</b></div>
                                    </div>
                                    <div style="margin-bottom:12px; display:flex; gap:8px;">
                                        <button onclick="window.showSetNextDescalePersonModal()" style="font-size:0.85rem; padding:6px 10px; background:rgba(162, 155, 254, 0.2); border:1px solid #a29bfe; color:var(--text); border-radius:4px; cursor:pointer; flex:1;">✏️ Set Next</button>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin:0; flex:1;">
                                            <input type="checkbox" id="descale-notif-toggle" ${descaleState.descale_notification_mode ? 'checked' : ''} onchange="window.toggleDescaleNotification(this.checked)" style="cursor:pointer;">
                                            <span style="font-size:0.9rem;">Enable notification banner</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div class="member-list">
                                        ${rows}
                                </div>
                                <div style="margin-top:12px">
                                    <button class="btn-primary" onclick="App.init()">Return to main view</button>
                                </div>
                        </div>
                `;
    }
};

UI.renderLogs = (logs) => {
    const items = logs.map(log => {
        const hasImage = log.fileId; // Check if this log has an associated image
        const imageBtn = hasImage ? `<button class="btn-view-image" onclick="window.viewExpenseImage('${log.fileId}')">Receipt</button>` : '';
        
        // Get emoji based on log type
        const typeIcons = {
            'COFFEE': '☕',
            'EXPENSE': '💰',
            'TOPUP': '💵',
            'BEANS': '🫘',
            'SURCHARGE': '⚠️',
            'DESCALE': '🧪'
        };
        const typeEmoji = typeIcons[log.type] || '⚙️';
        
        const date = new Date(log.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const message = log.message;
        
        return `
        <div class="activity-item">
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
            ${imageBtn}
        </div>
    `;
    }).join('');
    
    return `<div class="activity-feed"><h3>Recent Activity</h3>${items}</div>`;
};

UI.renderDescaleIndicator = (nextPerson) => {
    if (!nextPerson) return '';
    return `
        <div style="padding: 8px 12px; background: rgba(162, 155, 254, 0.1); border-left: 3px solid #a29bfe; border-radius: 6px; font-size: 0.85rem; color: var(--text); margin-bottom: 12px;">
            <span style="opacity: 0.7;">🧪 Next to descale: <b>${nextPerson}</b></span>
        </div>
    `;
};

UI.renderDescaleNotificationBanner = (nextPerson, nextPersonId) => {
    if (!nextPerson) return '';
    return `
        <div style="position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, #a29bfe 0%, #74b9ff 100%); padding: 20px; text-align: center; z-index: 5000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideDown 0.3s ease-out;">
            <div style="max-width: 900px; margin: 0 auto;">
                <div style="font-size: 1.3rem; font-weight: 700; color: white; margin-bottom: 8px;">🧪 Time to Descale!</div>
                <div style="font-size: 1rem; color: rgba(255,255,255,0.95); margin-bottom: 12px;"><b>${nextPerson}</b>, the coffee machine needs descaling.</div>
                <button onclick="window.showDescalingModal('${nextPersonId}')" style="background: white; color: #a29bfe; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.95rem;">Record Descaling</button>
            </div>
        </div>
        <style>
            @keyframes slideDown {
                from { transform: translateY(-100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            #app { padding-top: 100px; }
        </style>
    `;
};