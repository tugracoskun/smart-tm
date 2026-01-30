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
    try {
        chrome.contextMenus.create({
            id: 'addToWatchlist',
            title: 'Smart-TM: Watchlist\'e Ekle',
            contexts: ['link'],
            documentUrlPatterns: ['*://*.transfermarkt.com/*', '*://*.transfermarkt.com.tr/*', '*://*.transfermarkt.de/*']
        });
    } catch (e) {
        console.log('[Smart-TM] Context menu already exists or error:', e);
    }
});

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

    // In a real implementation, this would:
    // 1. Fetch latest transfers from Transfermarkt
    // 2. Compare with watchlist
    // 3. Send notifications for matches

    // For now, we'll just update the badge with watchlist count
    updateBadge(watchlist.length);
}

// ===== BADGE MANAGEMENT ===== //

function updateBadge(count) {
    if (count > 0) {
        chrome.action.setBadgeText({ text: count.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#EFAB14' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

// ===== NOTIFICATIONS ===== //

function showNotification(title, message, playerId = null) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: message,
        priority: 2
    }, (notificationId) => {
        if (playerId) {
            // Store notification ID for click handling
            chrome.storage.local.set({
                [`notification_${notificationId}`]: { playerId }
            });
        }
    });
}

// Handle notification clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
    const data = await chrome.storage.local.get(`notification_${notificationId}`);
    const notifData = data[`notification_${notificationId}`];

    if (notifData && notifData.playerId) {
        // Open player's Transfermarkt page
        chrome.tabs.create({
            url: `https://www.transfermarkt.com/spieler/profil/spieler/${notifData.playerId}`
        });
    }

    // Clean up
    chrome.storage.local.remove(`notification_${notificationId}`);
});

// ===== CONTEXT MENU HANDLER ===== //

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'addToWatchlist') {
        // Extract player ID from URL
        const match = info.linkUrl.match(/spieler\/(\d+)/);
        if (match) {
            // Send message to content script to add player
            chrome.tabs.sendMessage(tab.id, {
                action: 'addToWatchlistFromContext',
                playerId: match[1],
                url: info.linkUrl
            });
        }
    }
});

// ===== MESSAGE HANDLERS ===== //

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
            return true; // Keep channel open for async response

        default:
            sendResponse({ success: false, error: 'Unknown action' });
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Check if this is a Transfermarkt page
        if (tab.url.includes('transfermarkt')) {
            // Update badge with watchlist count
            getWatchlist().then(watchlist => {
                updateBadge(watchlist.length);
            });
        }
    }
});

console.log('[Smart-TM] Background service worker loaded');
