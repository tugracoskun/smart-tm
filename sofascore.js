/**
 * Smart-TM SofaScore Integration
 * Handles UI injection and interactions on SofaScore profile pages
 */

(function () {
    'use strict';

    console.log('[Smart-TM] SofaScore integration initialized');

    let isButtonInjected = false;

    // Setup MutationObserver to handle dynamic content loading
    const observer = new MutationObserver((mutations) => {
        if (!isButtonInjected) {
            const targetFound = injectSmartButton();
            if (targetFound) {
                // Observer'ı durdurmuyoruz çünkü sayfa içi navigasyonda buton silinebilir
                isButtonInjected = true;
            }
        } else {
            // Buton silinmiş mi kontrol et (sayfa değişince react silebilir)
            if (!document.querySelector('.smarttm-sofa-wrapper')) {
                isButtonInjected = false;
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    /**
     * Main Injection Function
     */
    function injectSmartButton() {
        // 1. Hedef Alanı Bul
        // SofaScore'da action butonları (Follow, Compare) genellikle tek bir container içindedir.
        // En güvenilir yöntem "Compare" veya "Takip Et" butonlarını aramaktır.

        // Yöntem A: sc- (styled components) classlarına güvenmeden buton metni/ikonu ile bulma
        const compareBtn = Array.from(document.querySelectorAll('button, a')).find(el =>
            el.textContent.trim().toUpperCase() === 'COMPARE' ||
            el.textContent.trim() === 'KARŞILAŞTIR'
        );

        // Yöntem B: Yıldız ikonlu butonu bulma (Follow butonu)
        // Genellikle header'ın sağ tarafındadır.

        let targetContainer = null;

        if (compareBtn) {
            targetContainer = compareBtn.parentElement;
        } else {
            // Eğer compare yoksa (mobil vs.) o zaman header actions container'ı manuel arayalım
            // Genellikle h2 (isim) ile aynı hizada ama sağdadır.
            const starIcons = document.querySelectorAll('svg > path[d*="M12 2l3.09 6.26"]'); // Yıldız path'i
            if (starIcons.length > 0) {
                // En üstteki muhtemelen profil yıldızıdır
                const starBtn = starIcons[0].closest('button');
                if (starBtn) targetContainer = starBtn.parentElement;
            }
        }

        if (!targetContainer) return false;

        // Zaten ekli mi?
        if (targetContainer.querySelector('.smarttm-sofa-wrapper')) return true;

        // 2. Oyuncu Verilerini Çek
        const playerData = scrapePlayerData();
        if (!playerData) return false;

        // 3. UI Oluştur
        const wrapper = document.createElement('div');
        wrapper.className = 'smarttm-sofa-wrapper';

        // Smart-TM Logo Icon
        const mainBtn = document.createElement('button');
        mainBtn.className = 'smarttm-sofa-btn';
        mainBtn.title = 'Smart-TM Scout Actions';
        mainBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

        // Dropdown Menu
        const menu = document.createElement('div');
        menu.className = 'smarttm-sofa-actions';

        // Action 1: Transfermarkt Profiline Git (Türkiye Lokasyonu)
        // Google "I'm Feeling Lucky" trick with site restriction
        const tmUrl = `https://www.google.com/search?q=${encodeURIComponent(playerData.name + ' ' + playerData.team + ' site:transfermarkt.com.tr')}&btnI`;

        const tmLink = document.createElement('a');
        tmLink.className = 'smarttm-action-btn smarttm-tm-link';
        tmLink.href = tmUrl;
        tmLink.target = '_blank';
        tmLink.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      Transfermarkt Profili
    `;

        // Action 2: Watchlist'e Ekle
        const favBtn = document.createElement('button');
        favBtn.className = 'smarttm-action-btn smarttm-fav-btn';
        favBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      Watchlist'e Ekle
    `;

        // Watchlist durumunu kontrol et (Asenkron)
        checkWatchlistStatus(playerData.id, favBtn);

        favBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleWatchlist(playerData, favBtn);
        });

        // Monte Et
        menu.appendChild(favBtn);
        menu.appendChild(tmLink);
        wrapper.appendChild(mainBtn);
        wrapper.appendChild(menu);

        // Olay Dinleyicileri (Toggle Menu)
        mainBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            wrapper.classList.toggle('active');
        });

        // Dışarı tıklandığında kapat
        document.addEventListener('click', () => {
            wrapper.classList.remove('active');
        });

        // Container'ın başına ekle (Compare butonunun soluna)
        targetContainer.insertBefore(wrapper, targetContainer.firstChild);

        return true;
    }

    /**
     * Scrape Player Data from DOM
     */
    function scrapePlayerData() {
        try {
            // İsim genellikle bir h2 tag'indedir
            const nameEl = document.querySelector('h2');
            const name = nameEl ? nameEl.textContent.trim() : null;

            if (!name) return null;

            // Takım bilgisini bul (Breadcrumb veya logo yanındaki metin)
            // Breadcrumb genelde: Football > Country > League > Team > Player
            let team = '';
            const breadcrumbs = document.querySelectorAll('nav ol li');
            if (breadcrumbs.length >= 4) {
                team = breadcrumbs[breadcrumbs.length - 2].textContent.trim();
            }

            // ID'yi URL'den al
            const urlParts = window.location.pathname.split('/');
            const id = 'ss_' + urlParts[urlParts.length - 1]; // ss_ prefix for SofaScore IDs

            // Ekstra bilgiler (opsiyonel)
            const countryEl = document.querySelector('span[class*="country"]');
            const country = countryEl ? countryEl.textContent.trim() : '';

            return {
                id,
                name,
                team,
                nationality: country,
                source: 'sofascore',
                profileUrl: window.location.href,
                imageUrl: document.querySelector('img[alt="' + name + '"]')?.src // Profil resmi varsa
            };
        } catch (e) {
            console.error('Scrape error:', e);
            return null;
        }
    }

    /**
     * Check if player is in watchlist
     */
    async function checkWatchlistStatus(playerId, btn) {
        if (!playerId) return;

        // Background script üzerinden değil direkt storage'dan okuyabiliriz (content_script yetkisi var)
        // Ancak storage.js'i include ettiğimiz için StorageManager'ı kullanabiliriz
        if (typeof StorageManager !== 'undefined') {
            const watchlist = await StorageManager.getWatchlist();
            const exists = watchlist.some(p => p.id === playerId);
            updateFavButtonState(btn, exists);
        }
    }

    /**
     * Toggle Watchlist
     */
    async function toggleWatchlist(player, btn) {
        if (typeof StorageManager === 'undefined') return;

        const watchlist = await StorageManager.getWatchlist();
        const exists = watchlist.some(p => p.id === player.id);

        if (exists) {
            await StorageManager.removeFromWatchlist(player.id);
            updateFavButtonState(btn, false);
            // Opsiyonel: Bildirim göster
        } else {
            await StorageManager.addToWatchlist(player);
            updateFavButtonState(btn, true);
        }
    }

    function updateFavButtonState(btn, isAdded) {
        if (isAdded) {
            btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        Watchlist'ten Çıkar
      `;
            btn.classList.add('added');
        } else {
            btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        Watchlist'e Ekle
      `;
            btn.classList.remove('added');
        }
    }

})();
