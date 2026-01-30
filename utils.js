/**
 * Smart-TM Utility Functions
 * Bu dosya Transfermarkt sayfalarından veri çekmek için en güvenli yöntemleri içerir.
 */

const Utils = {
    /**
     * Oyuncu İsmini KÖKTEN ÇÖZEN Fonksiyon
     * Sayfadaki metin ne olursa olsun (Merkez Orta Saha vs.), bu fonksiyon 
     * sadece gerçek oyuncu adını döndürür.
     */
    extractPlayerData(row) {
        // 1. ADIM: Sadece ana linki (ismin olduğu yer) bul
        const nameCell = row.querySelector('.hauptlink');
        const playerLink = nameCell ? nameCell.querySelector('a[href*="/profil/spieler/"]') : row.querySelector('a[href*="/profil/spieler/"]');

        if (!playerLink) return null;

        // 2. ADIM: İsim Temizleme (Title her zaman en garantisidir)
        let playerName = playerLink.getAttribute('title');

        // Eğer title yoksa veya 'Profil' yazıyorsa metne bak ama sadece ilk satırı al
        if (!playerName || playerName === 'Profil') {
            playerName = playerLink.textContent.split('\n')[0].trim();
        }

        // 3. ADIM: Mevkiyi Ayrı Bir Veri Al (Kesin Çözüm)
        const position = this.extractPosition(row);

        const idMatch = playerLink.href.match(/spieler\/(\d+)/);
        const cells = Array.from(row.querySelectorAll('td'));

        return {
            id: idMatch ? idMatch[1] : null,
            name: playerName.trim(),
            profileUrl: playerLink.href,
            age: this.extractAge(row),
            position: position, // Mevki artık tamamen ayrı bir veri olarak burada
            nationality: this.extractNationality(row),
            marketValue: this.extractMarketValue(row),
            fee: cells.length > 0 ? cells[cells.length - 1].textContent.trim() : null
        };
    },

    extractPosition(row) {
        // Mevki her zaman ismin altındaki ikincil satırdadır veya .posrela sınıfı içindedir
        const inlineTable = row.querySelector('.inline-table');
        if (inlineTable) {
            const trs = inlineTable.querySelectorAll('tr');
            if (trs.length >= 2) return trs[1].textContent.trim();
        }
        const posCell = row.querySelector('.posrela');
        if (posCell) {
            const trs = posCell.querySelectorAll('tr');
            if (trs.length >= 2) return trs[1].textContent.trim();
        }
        return null;
    },

    extractAge(row) {
        const cells = row.querySelectorAll('td');
        for (const cell of cells) {
            const text = cell.textContent.trim();
            if (/^\d{2}$/.test(text) && parseInt(text) > 14 && parseInt(text) < 50) return parseInt(text);
        }
        return null;
    },

    extractNationality(row) {
        const flag = row.querySelector('.flaggenrahmen');
        return flag ? (flag.title || flag.alt) : null;
    },

    extractMarketValue(row) {
        const cells = row.querySelectorAll('td');
        // Piyasa değeri genelde sondan bir önceki sütundur
        if (cells.length > 2) {
            return cells[cells.length - 2].textContent.trim();
        }
        return null;
    },

    parseMarketValue(val) {
        if (!val || val === '-') return 0;
        let num = parseFloat(val.replace(/[^0-9,.]/g, '').replace(',', '.'));
        if (val.includes('m')) num *= 1000000;
        if (val.includes('k')) num *= 1000;
        return num;
    },

    getTransferType(fee) {
        if (!fee) return 'unknown';
        const f = fee.toLowerCase();
        // Daha agresif eşleşme (Kiralık, Loan, kira)
        if (f.includes('kiralık') || f.includes('loan') || f.includes('kira')) return 'loan';
        // Bedelsiz, Free
        if (f.includes('bedelsiz') || f.includes('free') || f.includes('bedel') || f === '-') return 'free';
        // Diğer her şey (Bonservisli)
        return 'permanent';
    },

    getYouTubeSearchUrl(name) { return `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' skills goals')}`; },
    getWyScoutSearchUrl(name) { return `https://wyscout.com/search/?q=${encodeURIComponent(name)}`; },
    getInstatSearchUrl(name) { return `https://football.instatscout.com/search?query=${encodeURIComponent(name)}`; },

    createElement(tag, attrs = {}, children = null) {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'className') el.className = v;
            else if (k === 'dataset') Object.assign(el.dataset, v);
            else el.setAttribute(k, v);
        });
        if (children) el.innerHTML = children;
        return el;
    },

    debounce(fn, wait) {
        let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    },

    generateTransferId(row) {
        const data = this.extractPlayerData(row);
        return data ? `tr_${data.id}` : `tr_${Math.random()}`;
    }
};

if (typeof window !== 'undefined') window.Utils = Utils;
