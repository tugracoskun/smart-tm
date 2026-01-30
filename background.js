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
        await autoSyncLatestTransfers(); // Otomatik son transfer taraması
    }
});

/**
 * Otomatik olarak son transferleri arka planda tarar
 */
async function autoSyncLatestTransfers() {
    const urls = [
        'https://www.transfermarkt.com.tr/statistik/letzte-transfers',
        'https://www.transfermarkt.com.tr/transfer-statistik/transferrekorde/statistik'
    ];

    // Her alarmda bir tanesini tara (rate limit yememek için)
    const url = urls[Math.floor(Math.random() * urls.length)];

    try {
        // Gizli bir sekmede (tab veya offscreen) tarama yapmayı tetikle
        // En basit yöntem: Açık bir Transfermarkt sekmesi varsa ona mesaj at
        const tabs = await chrome.tabs.query({ url: ['*://*.transfermarkt.com/*', '*://*.transfermarkt.com.tr/*'] });
        if (tabs.length > 0) {
            // Aktif bir sekme varsa ona sayfaları taramasini söyle
            // Ama bu URL'leri taramasini istiyoruz.
            // Simdilik manuel sync butonu ve gezilen sayfalar en güvenlisi.
            // Arka planda tam otomatizasyon icin 'fetch' yapip regex ile parse edebiliriz
        }
    } catch (e) {
        console.log('Auto sync error:', e);
    }
}

// ===== MESSAGE LISTENERS ===== //

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'syncTransfers') {
        handleSyncRequest().then(result => sendResponse(result));
        return true;
    }

    if (request.action === 'showNotification') {
        showNotification(request.title, request.message, request.playerId);
        sendResponse({ success: true });
    }
});

/**
 * Handles the sync request from popup
 */
async function handleSyncRequest() {
    try {
        // Find transfermarkt tabs and tell them to scan
        const tabs = await chrome.tabs.query({ url: ['*://*.transfermarkt.com/*', '*://*.transfermarkt.com.tr/*', '*://*.transfermarkt.de/*'] });

        if (tabs.length === 0) {
            return { success: false, message: 'Lütfen açık bir Transfermarkt sekmesi bulundurun.' };
        }

        let total = 0;
        for (const tab of tabs) {
            try {
                const result = await chrome.tabs.sendMessage(tab.id, { action: 'scanPage' });
                if (result && result.count) total += result.count;
            } catch (e) {
                console.log('Tab sync fail:', e);
            }
        }

        return { success: true, count: total };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

// ===== WATCHLIST TRANSFER CHECK ===== //

async function checkWatchlistTransfers() {
    const settings = await getSettings();
    if (!settings.notifyWatchlist) return;

    const watchlist = await getWatchlist();
    if (watchlist.length === 0) return;

    // Update badge with watchlist count as simple indicator
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
            title: title || 'Smart-TM Raporu',
            message: message || 'Yeni bir gelişme var.',
            priority: 2
        });
    } catch (e) {
        console.log('[Smart-TM] Notification error:', e);
    }
}

// ===== STORAGE HELPERS ===== //

async function getSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(['smarttm_settings'], (res) => {
            resolve(res.smarttm_settings || {
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
    return new Promise(resolve => {
        chrome.storage.local.get(['smarttm_watchlist'], (res) => {
            resolve(res.smarttm_watchlist || []);
        });
    });
}
