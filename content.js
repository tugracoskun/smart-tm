/**
 * Smart-TM Content Script
 * Enhances Transfermarkt transfer pages with filtering, notes, and scout tools
 */

(async function () {
    'use strict';

    console.log('[Smart-TM] Content script loaded on:', window.location.href);

    // Configuration
    const CONFIG = {
        selectors: {
            // Sadece ana tablonun doğrudan çocukları olan satırları hedefle (iç tabloların satırlarını değil!)
            transferTable: '.items, #yw1, table.items, .responsive-table table, .grid-view table, .transfer-liste',
            transferRow: '.items > tbody > tr:not(.spacer), .responsive-table > table > tbody > tr:not(.spacer), #yw1 > table > tbody > tr:not(.spacer)',
            playerLink: 'a[href*="/profil/spieler/"]',
            feeCell: 'td.rechts:last-child, td:last-child'
        },
        colors: {
            loan: { bg: 'rgba(30, 136, 229, 0.15)', border: '#1e88e5' },
            permanent: { bg: 'rgba(67, 160, 71, 0.15)', border: '#43a047' },
            free: { bg: 'rgba(117, 117, 117, 0.15)', border: '#757575' }
        }
    };

    // State
    let settings = {};
    let watchlist = [];
    let notes = {};
    let isInitialized = false;

    // ===== INITIALIZATION ===== //

    async function init() {
        if (isInitialized) return;

        try {
            // Message listener for background requests
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.action === 'scanPage') {
                    cachePageTransfers().then(count => {
                        sendResponse({ success: true, count: count });
                    });
                    return true;
                }
            });

            // Load data from storage
            settings = await StorageManager.getSettings();
            watchlist = await StorageManager.getWatchlist();
            notes = await StorageManager.getNotes();

            console.log('[Smart-TM] Settings loaded:', settings);
            console.log('[Smart-TM] Checking if transfer page...');

            // Check if we're on a transfer page
            if (isTransferPage()) {
                console.log('[Smart-TM] Initializing on transfer page...');

                // Cache transfers from this page initially
                await cachePageTransfers();

                // Profil sayfası geliştirmeleri
                enhanceProfilePage();

                // OTOMATİK TARAMA: Her 5 saniyede bir sayfayı kontrol et (Yeni transferler için)
                setInterval(async () => {
                    await cachePageTransfers();
                }, 5000);

                // Apply enhancements
                if (settings.transferColors) applyTransferColors();
                if (settings.scoutButtons) addScoutButtons();
                if (settings.notesModule) addNoteButtons();
                addWatchlistButtons();
                injectFilterPanel();

                // Set up MutationObserver for dynamic content
                observePageChanges();

                isInitialized = true;
                console.log('[Smart-TM] Initialization complete!');
            } else {
                console.log('[Smart-TM] Not a transfer page, skipping initialization');
            }
        } catch (error) {
            console.error('[Smart-TM] Initialization error:', error);
        }
    }

    /**
     * Check if current page is a transfer-related page
     */
    function isTransferPage() {
        const url = window.location.href.toLowerCase();

        // Check for transfer-related keywords in URL
        const transferKeywords = [
            '/transfers/',
            '/neuestetransfers/',
            '/transferrekorde/',
            '/transferticker/',
            '/statistik/',
            '/letzte-transfers',
            '/transfer',
            'plus=1',  // Transfer filter parameter
            'plus1=1'
        ];

        const isTransfer = transferKeywords.some(keyword => url.includes(keyword));

        // Check for player profile page
        const isProfile = url.includes('/profil/spieler/');

        // Also check if there are player links and tables on the page (fallback)
        const hasPlayerLinks = document.querySelectorAll(CONFIG.selectors.playerLink).length > 0;
        const hasTables = document.querySelectorAll(CONFIG.selectors.transferTable).length > 0;

        console.log('[Smart-TM] URL check:', isTransfer, 'Is Profile:', isProfile, 'Player links:', hasPlayerLinks, 'Tables:', hasTables);

        return isTransfer || isProfile || (hasPlayerLinks && hasTables);
    }

    // ===== TRANSFER CACHE ===== //

    /**
     * Collect all transfers from current page and cache them for global search
     */
    async function cachePageTransfers() {
        const transfers = [];
        const tables = document.querySelectorAll(CONFIG.selectors.transferTable);

        tables.forEach(table => {
            const rows = table.querySelectorAll(CONFIG.selectors.transferRow);

            rows.forEach(row => {
                const playerData = Utils.extractPlayerData(row);
                // Sadece geçerli ismi ve mevkisi olanları cache'le
                if (playerData && playerData.id && playerData.name && playerData.position) {
                    // Add timestamp and source page
                    playerData.cachedAt = new Date().toISOString();
                    playerData.sourcePage = window.location.href;
                    transfers.push(playerData);
                }
            });
        });

        if (transfers.length > 0) {
            await StorageManager.addToTransferCache(transfers, window.location.href);
            console.log(`[Smart-TM] Cached ${transfers.length} transfers from this page`);
        }
    }

    // ===== PROFILE PAGE ENHANCEMENTS ===== //

    /**
     * Enhances the single player profile page with SofaScore and other scout links
     */
    function enhanceProfilePage() {
        // Sadece profil sayfalarında çalış
        if (!window.location.href.includes('/profil/spieler/')) return;

        const header = document.querySelector('h1.data-header__headline-wrapper');
        if (!header || header.querySelector('.smarttm-profile-actions')) return;

        // İsim Temizleme (#10 Koen Kostons -> Koen Kostons)
        let rawName = header.textContent.trim();
        // Numarayı temizle (örn: #10 )
        let name = rawName.replace(/^#\d+\s+/, '').trim();

        // Düzenleme ikonları varsa isimden onları da temizle
        const icons = header.querySelectorAll('a, span');
        icons.forEach(icon => {
            name = name.replace(icon.textContent, '').trim();
        });

        // Takım Bulma (Daha sağlam yöntem)
        let team = '';

        // 1. Yöntem: Logo üzerindeki title/alt bilgisini al (Genelde tam isim yazar: "Sheffield Wednesday")
        const clubLogo = document.querySelector('.data-header__box__club-link img, .data-header__club-image img');
        if (clubLogo) {
            team = clubLogo.getAttribute('title') || clubLogo.getAttribute('alt') || '';
        }

        // 2. Yöntem: Eğer logo yoksa metinden al (Kısaltmalı olabilir: "Sheff Wed")
        if (!team) {
            const clubLink = document.querySelector('.data-header__club a');
            if (clubLink) team = clubLink.textContent.trim();
        }

        // Takım ismini temizle ve normalize et
        if (team) {
            // Yaygın kısaltmaları aç
            const lowerTeam = team.toLowerCase();
            const replacements = {
                'sheff wed': 'Sheffield Wednesday',
                'sheff utd': 'Sheffield United',
                'man utd': 'Manchester United',
                'man city': 'Manchester City',
                'nottm forest': 'Nottingham Forest',
                'wolves': 'Wolverhampton Wanderers',
                'bor. m\'gladbach': 'Borussia Mönchengladbach',
                'm\'gladbach': 'Borussia Mönchengladbach',
                'b. dortmund': 'Borussia Dortmund',
                'b. leverkusen': 'Bayer Leverkusen',
                'a. madrid': 'Atletico Madrid',
                'r. madrid': 'Real Madrid',
                'sp. lisbon': 'Sporting CP',
                'qpr': 'Queens Park Rangers',
                'wba': 'West Bromwich Albion',
                'pne': 'Preston North End'
            };

            // Tam eşleşme kontrolü 
            for (const [abbr, full] of Object.entries(replacements)) {
                if (lowerTeam.includes(abbr)) {
                    team = full;
                    break;
                }
            }

            // Genel temizlik
            team = team.replace(/\s+(B|II|U\d+|Res\.?|Juv\.?)$/i, '') // B takımı, U19, vb.
                .replace(/^St\.\s/, 'Saint ') // St. -> Saint
                .trim();
        }

        // Container Oluştur
        const container = Utils.createElement('div', {
            className: 'smarttm-profile-actions'
        });
        container.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-left: 15px;
            vertical-align: middle;
        `;

        // URL Oluştur (SofaScore için optimize edildi)
        // Takım ismini kaldırıyoruz çünkü Google indexlemesi gecikebiliyor veya isim uyuşmazlığı olabiliyor.
        // İsim + site:sofascore.com en güvenli yöntem.
        const query = `${name} site:sofascore.com`;
        const sofaUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&btnI`;
        const sofaBtn = createProfileButton(
            sofaUrl,
            'SofaScore Profili',
            '<img src="https://play-lh.googleusercontent.com/-ugB_WCn3_i63xmKBrKHmmxKst2oZbiZbHFvjECGeRyi58aCsRZ08whCaWBUOk34M_dS" alt="SofaScore" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">'
        );
        container.appendChild(sofaBtn);

        // 2. YouTube Butonu
        if (settings.scoutYoutube) {
            const ytBtn = createProfileButton(
                Utils.getYouTubeSearchUrl(name),
                'YouTube\'da ara',
                '<svg viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'
            );
            container.appendChild(ytBtn);
        }

        // 3. FBref Butonu
        if (settings.scoutFbref) {
            const fbBtn = createProfileButton(
                Utils.getFBrefSearchUrl(name),
                'FBref\'te ara',
                '<img src="https://pbs.twimg.com/media/FgD8IVXXgAAuNZc.png" alt="FBref" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">'
            );
            container.appendChild(fbBtn);
        }

        // 4. WyScout Butonu
        if (settings.scoutWyscout) {
            const wsBtn = createProfileButton(
                Utils.getWyScoutSearchUrl(name),
                'WyScout\'ta ara',
                '<img src="https://play-lh.googleusercontent.com/DxEpOw_5RjzfyrNkCUDFGKxWL7s5o6p8bEnGz-rp2jwryENSXo4bjSJd37167mHD5w" alt="WyScout" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">'
            );
            container.appendChild(wsBtn);
        }



        // 5. Not Alma Butonu
        if (settings.notesModule) {
            // Player ID'yi URL'den al
            const playerId = window.location.href.match(/\/spieler\/(\d+)/)?.[1];

            if (playerId) {
                const noteBtn = Utils.createElement('button', {
                    className: 'smarttm-profile-btn',
                    title: 'Not Ekle/Düzenle'
                });

                noteBtn.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    background: #fff;
                    border: 1px solid #dce1e6;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    padding: 4px;
                    box-sizing: border-box;
                    margin-left: 4px; 
                `;

                noteBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="#EFAB14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                `;

                noteBtn.addEventListener('mouseenter', () => {
                    noteBtn.style.transform = 'translateY(-2px)';
                    noteBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                    noteBtn.style.borderColor = '#EFAB14';
                });
                noteBtn.addEventListener('mouseleave', () => {
                    noteBtn.style.transform = 'translateY(0)';
                    noteBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                    noteBtn.style.borderColor = '#dce1e6';
                });

                noteBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openNoteModal(playerId, name);
                });

                container.appendChild(noteBtn);
            }
        }

        header.appendChild(container);
    }

    /**
     * Helper to create consistent profile buttons
     */
    function createProfileButton(url, title, iconHtml) {
        const btn = Utils.createElement('a', {
            href: url,
            target: '_blank',
            title: title
        });

        btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: #fff;
            border: 1px solid #dce1e6;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            padding: 4px;
            box-sizing: border-box;
        `;

        btn.innerHTML = iconHtml;

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            btn.style.borderColor = '#aaa';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
            btn.style.borderColor = '#dce1e6';
        });

        return btn;
    }

    // ===== TRANSFER COLORS ===== //

    /**
     * Apply color coding to transfer rows based on transfer type
     */
    function applyTransferColors() {
        const tables = document.querySelectorAll(CONFIG.selectors.transferTable);

        tables.forEach(table => {
            const rows = table.querySelectorAll(CONFIG.selectors.transferRow);

            rows.forEach(row => {
                if (row.classList.contains('smarttm-colored')) return;

                const feeCell = row.querySelector('td:last-child');
                if (!feeCell) return;

                const feeText = feeCell.textContent.trim().toLowerCase();
                const transferType = Utils.getTransferType(feeText);

                const colorConfig = CONFIG.colors[transferType];
                if (colorConfig) {
                    row.style.backgroundColor = colorConfig.bg;
                    row.style.borderLeft = `3px solid ${colorConfig.border}`;
                    row.classList.add('smarttm-colored', `smarttm-${transferType}`);
                }
            });
        });
    }

    // ===== SCOUT BUTTONS ===== //

    /**
     * Her oyuncu satırına hızlı scout butonlarını (YouTube, WyScout, Instat) ekler
     */
    function addScoutButtons() {
        const rows = document.querySelectorAll(CONFIG.selectors.transferRow);

        rows.forEach(row => {
            if (row.querySelector('.smarttm-scout-buttons')) return;

            // Kesin oyuncu verisini çek
            const playerData = Utils.extractPlayerData(row);
            if (!playerData || !playerData.name) return;

            // Buton konteynerini oluştur
            const container = createScoutButtonsContainer(playerData.name);

            // İsmin olduğu hücreyi bul ve butonları oraya güvenli bir şekilde ekle
            const playerLink = row.querySelector('a[href*="/profil/spieler/"]');
            const nameCell = playerLink ? playerLink.closest('td') : null;

            if (nameCell) {
                nameCell.style.position = 'relative';
                nameCell.appendChild(container);
            }
        });
    }

    /**
     * Create scout buttons container
     */
    /**
     * Create scout buttons container
     */
    function createScoutButtonsContainer(playerName) {
        const container = Utils.createElement('div', {
            className: 'smarttm-scout-buttons'
        });

        // YouTube button
        if (settings.scoutYoutube) {
            const ytBtn = Utils.createElement('a', {
                className: 'smarttm-scout-btn smarttm-youtube',
                href: Utils.getYouTubeSearchUrl(playerName),
                target: '_blank',
                title: 'YouTube\'da ara'
            });
            ytBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
            container.appendChild(ytBtn);
        }

        // FBref button
        if (settings.scoutFbref) {
            const fbBtn = Utils.createElement('a', {
                className: 'smarttm-scout-btn smarttm-fbref',
                href: Utils.getFBrefSearchUrl(playerName),
                target: '_blank',
                title: 'FBref\'te ara'
            });
            fbBtn.innerHTML = `<img src="https://pbs.twimg.com/media/FgD8IVXXgAAuNZc.png" alt="FBref" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`;
            container.appendChild(fbBtn);
        }

        // WyScout button
        if (settings.scoutWyscout) {
            const wsBtn = Utils.createElement('a', {
                className: 'smarttm-scout-btn smarttm-wyscout',
                href: Utils.getWyScoutSearchUrl(playerName),
                target: '_blank',
                title: 'WyScout\'ta ara'
            });
            wsBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
            container.appendChild(wsBtn);
        }



        return container;
    }

    // ===== NOTE BUTTONS ===== //

    /**
     * Add note buttons to each transfer row
     */
    function addNoteButtons() {
        const tables = document.querySelectorAll(CONFIG.selectors.transferTable);

        tables.forEach(table => {
            const rows = table.querySelectorAll(CONFIG.selectors.transferRow);

            rows.forEach(row => {
                if (row.querySelector('.smarttm-note-btn')) return;

                const transferId = Utils.generateTransferId(row);
                const existingNote = notes[transferId];

                const lastCell = row.querySelector('td:last-child');
                if (!lastCell) return;

                const noteBtn = Utils.createElement('button', {
                    className: `smarttm-note-btn ${existingNote ? 'has-note' : ''}`,
                    title: existingNote ? 'Notu Düzenle' : 'Not Ekle',
                    dataset: { transferId }
                });
                noteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

                noteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openNoteModal(transferId, row);
                });

                lastCell.style.position = 'relative';
                lastCell.appendChild(noteBtn);
            });
        });
    }

    /**
     * Open note modal
     */
    function openNoteModal(transferId, row) {
        // Remove existing modal
        const existingModal = document.querySelector('.smarttm-note-modal');
        if (existingModal) existingModal.remove();

        const existingNote = notes[transferId];
        const playerData = Utils.extractPlayerData(row);

        const modal = Utils.createElement('div', { className: 'smarttm-note-modal' });
        modal.innerHTML = `
      <div class="smarttm-note-modal-content">
        <div class="smarttm-note-modal-header">
          <h3>📝 ${playerData?.name || 'Oyuncu'} için Not</h3>
          <button class="smarttm-note-modal-close">&times;</button>
        </div>
        <textarea class="smarttm-note-textarea" placeholder="Notunuzu buraya yazın...">${existingNote?.text || ''}</textarea>
        <div class="smarttm-note-modal-actions">
          <button class="smarttm-btn smarttm-btn-secondary smarttm-note-delete" ${!existingNote ? 'style="display:none"' : ''}>Sil</button>
          <button class="smarttm-btn smarttm-btn-primary smarttm-note-save">Kaydet</button>
        </div>
      </div>
    `;

        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('.smarttm-note-modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelector('.smarttm-note-save').addEventListener('click', async () => {
            const text = modal.querySelector('.smarttm-note-textarea').value.trim();
            if (text) {
                await StorageManager.saveNote(transferId, text);
                notes[transferId] = { text, updatedAt: new Date().toISOString() };
                const noteBtn = row.querySelector('.smarttm-note-btn');
                if (noteBtn) noteBtn.classList.add('has-note');
            }
            modal.remove();
        });

        modal.querySelector('.smarttm-note-delete').addEventListener('click', async () => {
            await StorageManager.deleteNote(transferId);
            delete notes[transferId];
            const noteBtn = row.querySelector('.smarttm-note-btn');
            if (noteBtn) noteBtn.classList.remove('has-note');
            modal.remove();
        });

        // Focus textarea
        modal.querySelector('.smarttm-note-textarea').focus();
    }

    // ===== WATCHLIST BUTTONS ===== //

    /**
     * Her oyuncuya Watchlist yıldız butonlarını ekler
     */
    function addWatchlistButtons() {
        const rows = document.querySelectorAll(CONFIG.selectors.transferRow);

        rows.forEach(row => {
            if (row.querySelector('.smarttm-watchlist-btn')) return;

            const playerData = Utils.extractPlayerData(row);
            if (!playerData || !playerData.id) return;

            const isInWatchlist = watchlist.some(p => p.id === playerData.id);

            const btn = Utils.createElement('button', {
                className: `smarttm-watchlist-btn ${isInWatchlist ? 'active' : ''}`,
                title: isInWatchlist ? 'Watchlist\'ten Çıkar' : 'Watchlist\'e Ekle',
                dataset: { playerId: playerData.id }
            });
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="${isInWatchlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();

                if (isInWatchlist) {
                    await StorageManager.removeFromWatchlist(playerData.id);
                    watchlist = watchlist.filter(p => p.id !== playerData.id);
                    btn.classList.remove('active');
                    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
                    btn.title = 'Watchlist\'e Ekle';
                } else {
                    await StorageManager.addToWatchlist(playerData);
                    watchlist.push(playerData);
                    btn.classList.add('active');
                    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
                    btn.title = 'Watchlist\'ten Çıkar';
                }
            });

            // İsmin olduğu hücrenin başına ekle
            const playerLink = row.querySelector('a[href*="/profil/spieler/"]');
            const nameCell = playerLink ? playerLink.closest('td') : null;
            if (nameCell) {
                nameCell.insertBefore(btn, nameCell.firstChild);
            }
        });
    }

    // ===== FILTER PANEL ===== //

    /**
     * Inject the Smart Filter panel above the transfer table
     */
    function injectFilterPanel() {
        const table = document.querySelector(CONFIG.selectors.transferTable);
        if (!table || document.querySelector('.smarttm-filter-panel')) return;

        // Collect unique positions and nationalities from the page
        const positions = new Set();
        const nationalities = new Set();

        document.querySelectorAll(CONFIG.selectors.transferRow).forEach(row => {
            const playerData = Utils.extractPlayerData(row);
            if (playerData) {
                if (playerData.position) positions.add(playerData.position);
                if (playerData.nationality) nationalities.add(playerData.nationality);
            }
        });

        const positionOptions = Array.from(positions).sort().map(p =>
            `<option value="${p}">${p}</option>`
        ).join('');

        const nationalityOptions = Array.from(nationalities).sort().map(n =>
            `<option value="${n}">${n}</option>`
        ).join('');

        const panel = Utils.createElement('div', { className: 'smarttm-filter-panel' });
        panel.innerHTML = `
      <div class="smarttm-filter-header">
        <div class="smarttm-filter-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span>Smart Scouting Filters</span>
          <span class="smarttm-stats" id="smarttm-stats"></span>
        </div>
        <button class="smarttm-filter-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
      <div class="smarttm-filter-body">
        <div class="smarttm-filter-row">
          <div class="smarttm-filter-group">
            <label>Yaş Aralığı</label>
            <div class="smarttm-filter-range">
              <input type="number" id="smarttm-age-min" placeholder="Min" min="15" max="45">
              <span>-</span>
              <input type="number" id="smarttm-age-max" placeholder="Max" min="15" max="45">
            </div>
          </div>
          <div class="smarttm-filter-group">
            <label>Piyasa Değeri</label>
            <div class="smarttm-filter-range">
              <input type="text" id="smarttm-value-min" placeholder="Min (€)">
              <span>-</span>
              <input type="text" id="smarttm-value-max" placeholder="Max (€)">
            </div>
          </div>
          <div class="smarttm-filter-group">
            <label>Pozisyon</label>
            <select id="smarttm-position" class="smarttm-select">
              <option value="">Tümü</option>
              ${positionOptions}
            </select>
          </div>
        </div>
        <div class="smarttm-filter-row">
          <div class="smarttm-filter-group">
            <label>Milliyet</label>
            <select id="smarttm-nationality" class="smarttm-select">
              <option value="">Tümü</option>
              ${nationalityOptions}
            </select>
          </div>
          <div class="smarttm-filter-group">
            <label>Transfer Tipi</label>
            <div class="smarttm-filter-checkboxes">
              <label><input type="checkbox" id="smarttm-type-loan" checked> Kiralık</label>
              <label><input type="checkbox" id="smarttm-type-permanent" checked> Bonservisli</label>
              <label><input type="checkbox" id="smarttm-type-free" checked> Bedelsiz</label>
            </div>
          </div>
          <div class="smarttm-filter-group">
            <label>Hızlı Filtreler</label>
            <div class="smarttm-quick-filters">
              <button class="smarttm-quick-btn" data-filter="young">U21</button>
              <button class="smarttm-quick-btn" data-filter="talent">Yetenek (U23)</button>
              <button class="smarttm-quick-btn" data-filter="free-agents">Bedelsiz</button>
            </div>
          </div>
        </div>
        <div class="smarttm-filter-actions">
          <button class="smarttm-btn smarttm-btn-secondary" id="smarttm-filter-reset">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            Sıfırla
          </button>
          <button class="smarttm-btn smarttm-btn-primary" id="smarttm-filter-apply">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Uygula
          </button>
          <button class="smarttm-btn smarttm-btn-accent" id="smarttm-filter-save">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Kaydet
          </button>
        </div>
      </div>
      <div class="smarttm-legend">
        <div class="smarttm-legend-item">
          <span class="smarttm-legend-color loan"></span>
          <span>Kiralık</span>
        </div>
        <div class="smarttm-legend-item">
          <span class="smarttm-legend-color permanent"></span>
          <span>Bonservisli</span>
        </div>
        <div class="smarttm-legend-item">
          <span class="smarttm-legend-color free"></span>
          <span>Bedelsiz</span>
        </div>
      </div>
    `;

        // Insert before table
        table.parentNode.insertBefore(panel, table);

        // Update stats
        updateFilterStats();

        // Event listeners
        panel.querySelector('.smarttm-filter-toggle').addEventListener('click', () => {
            panel.classList.toggle('collapsed');
        });

        panel.querySelector('#smarttm-filter-apply').addEventListener('click', applyFilters);
        panel.querySelector('#smarttm-filter-reset').addEventListener('click', resetFilters);
        panel.querySelector('#smarttm-filter-save').addEventListener('click', saveCurrentFilter);

        // Quick filter buttons
        panel.querySelectorAll('.smarttm-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const isAlreadyActive = btn.classList.contains('active');

                // Remove active class from all
                panel.querySelectorAll('.smarttm-quick-btn').forEach(b => b.classList.remove('active'));

                if (isAlreadyActive) {
                    resetFilters();
                } else {
                    btn.classList.add('active');
                    const filter = btn.dataset.filter;
                    applyQuickFilter(filter);
                }
            });
        });

        // Real-time filtering on input change
        const inputs = panel.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                // If any input changes manually, remove active state from quick filters
                panel.querySelectorAll('.smarttm-quick-btn').forEach(b => b.classList.remove('active'));
                applyFilters();
            });
        });
    }

    /**
     * Update filter statistics display
     */
    function updateFilterStats() {
        const statsEl = document.getElementById('smarttm-stats');
        if (!statsEl) return;

        const tables = document.querySelectorAll(CONFIG.selectors.transferTable);
        let total = 0;
        let visible = 0;

        tables.forEach(table => {
            const rows = table.querySelectorAll(CONFIG.selectors.transferRow);
            rows.forEach(row => {
                total++;
                if (row.style.display !== 'none') visible++;
            });
        });

        if (total === visible) {
            statsEl.textContent = `(${total} transfer)`;
        } else {
            statsEl.textContent = `(${visible}/${total} gösteriliyor)`;
        }
    }

    /**
     * Apply quick filter presets
     */
    function applyQuickFilter(filterType) {
        // Reset first
        resetFilters();

        switch (filterType) {
            case 'young':
                document.getElementById('smarttm-age-min').value = '15';
                document.getElementById('smarttm-age-max').value = '21';
                break;
            case 'talent':
                document.getElementById('smarttm-age-min').value = '15';
                document.getElementById('smarttm-age-max').value = '23';
                break;
            case 'free-agents':
                document.getElementById('smarttm-type-loan').checked = false;
                document.getElementById('smarttm-type-permanent').checked = false;
                document.getElementById('smarttm-type-free').checked = true;
                break;
        }

        applyFilters();
    }

    /**
     * Apply filters to the transfer table
     */
    function applyFilters() {
        const ageMin = parseInt(document.getElementById('smarttm-age-min')?.value) || 0;
        const ageMax = parseInt(document.getElementById('smarttm-age-max')?.value) || 99;
        const valueMin = Utils.parseMarketValue(document.getElementById('smarttm-value-min')?.value) || 0;
        const valueMax = Utils.parseMarketValue(document.getElementById('smarttm-value-max')?.value) || Infinity;

        const showLoan = document.getElementById('smarttm-type-loan')?.checked ?? true;
        const showPermanent = document.getElementById('smarttm-type-permanent')?.checked ?? true;
        const showFree = document.getElementById('smarttm-type-free')?.checked ?? true;

        // New filters
        const selectedPosition = document.getElementById('smarttm-position')?.value || '';
        const selectedNationality = document.getElementById('smarttm-nationality')?.value || '';

        const tables = document.querySelectorAll(CONFIG.selectors.transferTable);

        tables.forEach(table => {
            const rows = table.querySelectorAll(CONFIG.selectors.transferRow);

            rows.forEach(row => {
                const playerData = Utils.extractPlayerData(row);
                if (!playerData) return;

                let visible = true;

                // Age filter
                const age = playerData.age || 0;
                if (age < ageMin || age > ageMax) {
                    visible = false;
                }

                // Market value filter
                const value = Utils.parseMarketValue(playerData.marketValue) || 0;
                if (value < valueMin || value > valueMax) {
                    visible = false;
                }

                // Position filter
                if (selectedPosition && playerData.position !== selectedPosition) {
                    visible = false;
                }

                // Nationality filter
                if (selectedNationality && playerData.nationality !== selectedNationality) {
                    visible = false;
                }

                // Transfer type filter
                const feeText = playerData.fee || '';
                const transferType = Utils.getTransferType(feeText);

                if (transferType === 'loan' && !showLoan) visible = false;
                if (transferType === 'permanent' && !showPermanent) visible = false;
                if (transferType === 'free' && !showFree) visible = false;

                row.style.display = visible ? '' : 'none';
            });
        });

        // Update stats after filtering
        updateFilterStats();
    }

    /**
     * Reset all filters
     */
    function resetFilters() {
        document.getElementById('smarttm-age-min').value = '';
        document.getElementById('smarttm-age-max').value = '';
        document.getElementById('smarttm-value-min').value = '';
        document.getElementById('smarttm-value-max').value = '';
        document.getElementById('smarttm-type-loan').checked = true;
        document.getElementById('smarttm-type-permanent').checked = true;
        document.getElementById('smarttm-type-free').checked = true;

        // Reset new filters
        const positionSelect = document.getElementById('smarttm-position');
        const nationalitySelect = document.getElementById('smarttm-nationality');
        if (positionSelect) positionSelect.value = '';
        if (nationalitySelect) nationalitySelect.value = '';

        // Show all rows
        const tables = document.querySelectorAll(CONFIG.selectors.transferTable);
        tables.forEach(table => {
            const rows = table.querySelectorAll(CONFIG.selectors.transferRow);
            rows.forEach(row => row.style.display = '');
        });

        // Update stats
        updateFilterStats();
    }

    /**
     * Save current filter configuration
     */
    async function saveCurrentFilter() {
        const filterName = prompt('Filtre için bir isim girin:');
        if (!filterName) return;

        const filter = {
            name: filterName,
            ageMin: parseInt(document.getElementById('smarttm-age-min')?.value) || null,
            ageMax: parseInt(document.getElementById('smarttm-age-max')?.value) || null,
            valueMin: document.getElementById('smarttm-value-min')?.value || null,
            valueMax: document.getElementById('smarttm-value-max')?.value || null,
            transferTypes: []
        };

        if (document.getElementById('smarttm-type-loan')?.checked) filter.transferTypes.push('Kiralık');
        if (document.getElementById('smarttm-type-permanent')?.checked) filter.transferTypes.push('Bonservisli');
        if (document.getElementById('smarttm-type-free')?.checked) filter.transferTypes.push('Bedelsiz');

        await StorageManager.saveFilter(filter);
        alert('Filtre kaydedildi!');
    }

    // ===== MUTATION OBSERVER ===== //

    /**
     * Observe page changes for dynamically loaded content
     */
    function observePageChanges() {
        const observer = new MutationObserver(Utils.debounce((mutations) => {
            let shouldReapply = false;

            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && (node.matches?.('tr') || node.querySelector?.('tr'))) {
                            shouldReapply = true;
                        }
                    });
                }
            });

            if (shouldReapply) {
                console.log('[Smart-TM] Detected new content, reapplying enhancements...');
                if (settings.transferColors) applyTransferColors();
                if (settings.scoutButtons) addScoutButtons();
                if (settings.notesModule) addNoteButtons();
                addWatchlistButtons();
            }
        }, 500));

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // ===== MESSAGE LISTENER ===== //

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.action) {
            case 'settingsChanged':
                loadSettingsAndReapply();
                break;
            case 'applyFilter':
                applyStoredFilter(request.filter);
                break;
        }
        sendResponse({ success: true });
    });

    /**
     * Reload settings and reapply enhancements
     */
    async function loadSettingsAndReapply() {
        settings = await StorageManager.getSettings();

        // Remove existing enhancements and reapply
        document.querySelectorAll('.smarttm-scout-buttons, .smarttm-note-btn, .smarttm-watchlist-btn').forEach(el => el.remove());
        document.querySelectorAll('.smarttm-colored').forEach(row => {
            row.style.backgroundColor = '';
            row.style.borderLeft = '';
            row.classList.remove('smarttm-colored', 'smarttm-loan', 'smarttm-permanent', 'smarttm-free');
        });

        if (settings.transferColors) applyTransferColors();
        if (settings.scoutButtons) addScoutButtons();
        if (settings.notesModule) addNoteButtons();
        addWatchlistButtons();
    }

    /**
     * Apply a stored filter
     */
    function applyStoredFilter(filter) {
        if (filter.ageMin) document.getElementById('smarttm-age-min').value = filter.ageMin;
        if (filter.ageMax) document.getElementById('smarttm-age-max').value = filter.ageMax;
        if (filter.valueMin) document.getElementById('smarttm-value-min').value = filter.valueMin;
        if (filter.valueMax) document.getElementById('smarttm-value-max').value = filter.valueMax;

        document.getElementById('smarttm-type-loan').checked = filter.transferTypes?.includes('Kiralık') ?? true;
        document.getElementById('smarttm-type-permanent').checked = filter.transferTypes?.includes('Bonservisli') ?? true;
        document.getElementById('smarttm-type-free').checked = filter.transferTypes?.includes('Bedelsiz') ?? true;

        applyFilters();
    }

    /**
     * Add note buttons to transfer list rows
     */
    async function addNoteButtons() {
        const rows = document.querySelectorAll(CONFIG.selectors.transferRow);

        // Get all notes to check which players have notes
        const allNotes = await StorageManager.getNotes();

        rows.forEach(row => {
            const playerData = Utils.extractPlayerData(row);
            if (!playerData || !playerData.id) return;

            // Avoid duplicates
            if (row.querySelector('.smarttm-note-btn')) return;

            const nameLink = row.querySelector('a[href*="/profil/spieler/"]');
            if (!nameLink) return;

            const hasNote = !!allNotes[playerData.id];

            const btn = Utils.createElement('span', {
                className: 'smarttm-note-btn',
                title: hasNote ? 'Notu Düzenle' : 'Not Ekle',
                style: `
                    cursor: pointer; 
                    margin-left: 5px; 
                    display: inline-flex; 
                    vertical-align: middle;
                    opacity: ${hasNote ? '1' : '0.3'};
                    transition: opacity 0.2s;
                `
            });

            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${hasNote ? '#EFAB14' : 'currentColor'}" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

            btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
            btn.addEventListener('mouseleave', () => { if (!allNotes[playerData.id]) btn.style.opacity = '0.3'; });

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openNoteModal(playerData.id, playerData.name);
            });

            // Insert after name
            nameLink.parentNode.insertBefore(btn, nameLink.nextSibling);
        });
    }

    /**
     * Open Note Modal
     */
    async function openNoteModal(playerId, playerName) {
        // Varsa önce temizle
        const existingModal = document.querySelector('.smarttm-modal-overlay');
        if (existingModal) existingModal.remove();

        const existingNote = await StorageManager.getNote(playerId);
        const noteText = existingNote ? existingNote.text : '';

        const overlay = Utils.createElement('div', { className: 'smarttm-modal-overlay' });

        overlay.innerHTML = `
            <div class="smarttm-modal">
                <div class="smarttm-modal-header">
                    <h3 class="smarttm-modal-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px;">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        Oyuncu Notu: ${playerName}
                    </h3>
                    <button class="smarttm-modal-close" title="Kapat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="smarttm-modal-body">
                    <textarea class="smarttm-note-textarea" placeholder="Bu oyuncu hakkında notlarınızı buraya yazın... (Örn: Güçlü sol ayak, hava hakimiyeti iyi, sözleşmesi bitiyor...)">${noteText}</textarea>
                </div>
                <div class="smarttm-modal-footer">
                    <span class="smarttm-note-status"></span>
                    <button class="smarttm-btn smarttm-btn-cancel">İptal</button>
                    <button class="smarttm-btn smarttm-btn-save">Kaydet</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Animasyon için frame bekle
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });

        // Event Listeners
        const closeBtn = overlay.querySelector('.smarttm-modal-close');
        const cancelBtn = overlay.querySelector('.smarttm-btn-cancel');
        const saveBtn = overlay.querySelector('.smarttm-btn-save');
        const textarea = overlay.querySelector('.smarttm-note-textarea');
        const status = overlay.querySelector('.smarttm-note-status');

        const closeModal = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 250);
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        // Overlay'e tıklayınca kapat (Modal dışı)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        saveBtn.addEventListener('click', async () => {
            const newText = textarea.value.trim();
            saveBtn.textContent = 'Kaydediliyor...';

            try {
                if (newText) {
                    await StorageManager.saveNote(playerId, newText);
                } else {
                    await StorageManager.deleteNote(playerId);
                }

                status.textContent = 'Kaydedildi!';
                status.style.color = '#4caf50';
                saveBtn.textContent = 'Kaydet';

                // Content script'i güncelle: Listede ikon rengini güncelle
                if (settings.notesModule) addNoteButtons();

                setTimeout(closeModal, 800);
            } catch (err) {
                console.error(err);
                status.textContent = 'Hata oluştu!';
                status.style.color = '#f44336';
                saveBtn.textContent = 'Kaydet';
            }
        });

        // Focus
        textarea.focus();
    }

    // ===== START ===== //

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
