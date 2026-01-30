/**
 * Smart-TM Background Service Worker
 * Handles notifications, alarms, and badge updates
 */

// ===== INITIALIZATION ===== //

chrome.runtime.onInstalled.addListener((details) => {
    console.log('[Smart-TM] Extension installed/updated:', details.reason);

    // Set up alarm for periodic checks
    chrome.alarms.create('checkTransfers', {
        periodInMinutes: 30  // Check every 30 minutes
    });

    // Initialize default settings if first install
    if (details.reason === 'install') {
        chrome.storage.local.set({
            smarttm_settings: {
                transferColors: true,
                scoutButtons: true,
                notesModule: true,
                notifyWatchlist: true,
                notifyLeagues: false
            },
            smarttm_watchlist: [],
            smarttm_filters: [],
            smarttm_notes: {},
            smarttm_league_radar: []
        });
    }

    // Create context menu
    setupContextMenu();
});

// ===== CONTEXT MENU SETUP ===== //

function setupContextMenu() {
    try {
        if (typeof chrome !== 'undefined' && chrome.contextMenus) {
            chrome.contextMenus.removeAll(() => {
                chrome.contextMenus.create({
                    id: 'addToWatchlist',
                    title: 'Smart-TM: Watchlist\'e Ekle',
                    contexts: ['link'],
                    documentUrlPatterns: ['*://*.transfermarkt.com/*', '*://*.transfermarkt.com.tr/*', '*://*.transfermarkt.de/*']
                });
            });
        }
    } catch (e) {
        console.log('[Smart-TM] Context menu setup error:', e);
    }
}

// ===== ALARM HANDLER ===== //

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'checkTransfers') {
        console.log('[Smart-TM] Running periodic transfer check...');
        await checkWatchlistTransfers();
    }
});

// ===== WATCHLIST TRANSFER CHECK ===== //

async function checkWatchlistTransfers() {
    const settings = await getSettings();
    if (!settings.notifyWatchlist) return;

    const watchlist = await getWatchlist();
    if (watchlist.length === 0) return;

    // Update badge with watchlist count
    updateBadge(watchlist.length);
}

// ===== BADGE MANAGEMENT ===== //

function updateBadge(count) {
    try {
        if (count > 0) {
            chrome.action.setBadgeText({ text: count.toString() });
            chrome.action.setBadgeBackgroundColor({ color: '#EFAB14' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
    } catch (e) {
        console.log('[Smart-TM] Badge update error:', e);
    }
}

// ===== NOTIFICATIONS ===== //

function showNotification(title, message, playerId = null) {
    try {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: title,
            message: message,
            priority: 2
        }, (notificationId) => {
            if (playerId && notificationId) {
                chrome.storage.local.set({
                    [`notification_${notificationId}`]: { playerId }
                });
            }
        });
    } catch (e) {
        console.log('[Smart-TM] Notification error:', e);
    }
}

// ===== EVENT LISTENERS SETUP ===== //

// Handle notification clicks
try {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
        chrome.notifications.onClicked.addListener(async (notificationId) => {
            try {
                const data = await chrome.storage.local.get(`notification_${notificationId}`);
                const notifData = data[`notification_${notificationId}`];

                if (notifData && notifData.playerId) {
                    chrome.tabs.create({
                        url: `https://www.transfermarkt.com/spieler/profil/spieler/${notifData.playerId}`
                    });
                }

                chrome.storage.local.remove(`notification_${notificationId}`);
            } catch (e) {
                console.log('[Smart-TM] Notification click handler error:', e);
            }
        });
    }
} catch (e) {
    console.log('[Smart-TM] Notifications listener setup error:', e);
}

// Handle context menu clicks
try {
    if (typeof chrome !== 'undefined' && chrome.contextMenus) {
        chrome.contextMenus.onClicked.addListener((info, tab) => {
            try {
                if (info.menuItemId === 'addToWatchlist') {
                    const match = info.linkUrl.match(/spieler\/(\d+)/);
                    if (match && tab && tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'addToWatchlistFromContext',
                            playerId: match[1],
                            url: info.linkUrl
                        });
                    }
                }
            } catch (e) {
                console.log('[Smart-TM] Context menu click handler error:', e);
            }
        });
    }
} catch (e) {
    console.log('[Smart-TM] Context menu listener setup error:', e);
}

// ===== MESSAGE HANDLERS ===== //

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        switch (request.action) {
            case 'showNotification':
                showNotification(request.title, request.message, request.playerId);
                sendResponse({ success: true });
                break;

            case 'updateBadge':
                updateBadge(request.count);
                sendResponse({ success: true });
                break;

            case 'getWatchlistCount':
                getWatchlist().then(watchlist => {
                    sendResponse({ count: watchlist.length });
                });
                return true;

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (e) {
        console.log('[Smart-TM] Message handler error:', e);
        sendResponse({ success: false, error: e.message });
    }
});

// ===== STORAGE HELPERS ===== //

async function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['smarttm_settings'], (result) => {
            resolve(result.smarttm_settings || {
                transferColors: true,
                scoutButtons: true,
                notesModule: true,
                notifyWatchlist: true,
                notifyLeagues: false
            });
        });
    });
}

async function getWatchlist() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['smarttm_watchlist'], (result) => {
            resolve(result.smarttm_watchlist || []);
        });
    });
}

// ===== TAB UPDATE HANDLER ===== //

try {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab && tab.url) {
            if (tab.url.includes('transfermarkt')) {
                getWatchlist().then(watchlist => {
                    updateBadge(watchlist.length);
                });
            }
        }
    });
} catch (e) {
    console.log('[Smart-TM] Tab listener setup error:', e);
}

console.log('[Smart-TM] Background service worker loaded');
