/**
 * Smart-TM Utility Functions
 */

const Utils = {
    /**
     * Generate YouTube search URL for a player
     * @param {string} playerName - Player name
     * @returns {string}
     */
    getYouTubeSearchUrl(playerName) {
        const query = encodeURIComponent(`${playerName} skills goals highlights`);
        return `https://www.youtube.com/results?search_query=${query}`;
    },

    /**
     * Generate WyScout search URL for a player
     * @param {string} playerName - Player name
     * @returns {string}
     */
    getWyScoutSearchUrl(playerName) {
        const query = encodeURIComponent(playerName);
        return `https://wyscout.com/search/?q=${query}`;
    },

    /**
     * Generate Instat search URL for a player
     * @param {string} playerName - Player name
     * @returns {string}
     */
    getInstatSearchUrl(playerName) {
        const query = encodeURIComponent(playerName);
        return `https://football.instatscout.com/search?query=${query}`;
    },

    /**
     * Generate Transfermarkt profile URL
     * @param {string} playerSlug - Player slug from TM
     * @param {string} playerId - Player ID
     * @returns {string}
     */
    getTransfermarktProfileUrl(playerSlug, playerId) {
        return `https://www.transfermarkt.com/${playerSlug}/profil/spieler/${playerId}`;
    },

    /**
     * Parse age from string like "22" or "(22)"
     * @param {string} ageStr - Age string
     * @returns {number|null}
     */
    parseAge(ageStr) {
        if (!ageStr) return null;
        const match = ageStr.match(/\d+/);
        return match ? parseInt(match[0], 10) : null;
    },

    /**
     * Parse market value from string like "€1.50m" or "€500k"
     * @param {string} valueStr - Market value string
     * @returns {number|null} Value in euros
     */
    parseMarketValue(valueStr) {
        if (!valueStr || valueStr === '-') return null;

        const str = valueStr.toLowerCase().replace(/[^0-9.,kmbn€]/g, '');
        let value = parseFloat(str.replace(',', '.'));

        if (isNaN(value)) return null;

        if (valueStr.toLowerCase().includes('bn') || valueStr.toLowerCase().includes('mrd')) {
            value *= 1000000000;
        } else if (valueStr.toLowerCase().includes('m') || valueStr.toLowerCase().includes('mio')) {
            value *= 1000000;
        } else if (valueStr.toLowerCase().includes('k') || valueStr.toLowerCase().includes('tsd')) {
            value *= 1000;
        }

        return value;
    },

    /**
     * Format market value for display
     * @param {number} value - Value in euros
     * @returns {string}
     */
    formatMarketValue(value) {
        if (value === null || value === undefined) return '-';

        if (value >= 1000000000) {
            return `€${(value / 1000000000).toFixed(2)}bn`;
        } else if (value >= 1000000) {
            return `€${(value / 1000000).toFixed(2)}m`;
        } else if (value >= 1000) {
            return `€${(value / 1000).toFixed(0)}k`;
        }
        return `€${value}`;
    },

    /**
     * Parse date from various formats
     * @param {string} dateStr - Date string
     * @returns {Date|null}
     */
    parseDate(dateStr) {
        if (!dateStr) return null;

        // Try common formats
        const formats = [
            /(\d{2})\.(\d{2})\.(\d{4})/, // DD.MM.YYYY
            /(\d{4})-(\d{2})-(\d{2})/,   // YYYY-MM-DD
            /(\d{2})\/(\d{2})\/(\d{4})/  // DD/MM/YYYY
        ];

        for (const format of formats) {
            const match = dateStr.match(format);
            if (match) {
                if (format === formats[0] || format === formats[2]) {
                    return new Date(match[3], match[2] - 1, match[1]);
                } else {
                    return new Date(match[1], match[2] - 1, match[3]);
                }
            }
        }

        // Fallback to native parsing
        const parsed = new Date(dateStr);
        return isNaN(parsed.getTime()) ? null : parsed;
    },

    /**
     * Format date for display
     * @param {Date|string} date - Date object or string
     * @returns {string}
     */
    formatDate(date) {
        if (!date) return '-';

        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return '-';

        return d.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    /**
     * Get relative time string
     * @param {Date|string} date - Date object or string
     * @returns {string}
     */
    getRelativeTime(date) {
        const d = typeof date === 'string' ? new Date(date) : date;
        const now = new Date();
        const diffMs = now - d;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Bugün';
        if (diffDays === 1) return 'Dün';
        if (diffDays < 7) return `${diffDays} gün önce`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} hafta önce`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} ay önce`;
        return `${Math.floor(diffDays / 365)} yıl önce`;
    },

    /**
     * Determine transfer type from fee text
     * @param {string} feeText - Transfer fee text
     * @returns {string} 'loan' | 'permanent' | 'free' | 'unknown'
     */
    getTransferType(feeText) {
        if (!feeText) return 'unknown';

        const text = feeText.toLowerCase();

        // Loan keywords in multiple languages
        const loanKeywords = ['kiralık', 'loan', 'leihge', 'leihe', 'prestito', 'prêt', 'cedido', 'empréstimo'];
        if (loanKeywords.some(kw => text.includes(kw))) {
            return 'loan';
        }

        // Free transfer keywords
        const freeKeywords = ['bedelsiz', 'free', 'ablösefrei', 'serbest', 'libre', 'gratis', 'svincolato'];
        if (freeKeywords.some(kw => text.includes(kw)) || text === '-' || text === '?') {
            return 'free';
        }

        // If there's a monetary value, it's permanent
        if (text.includes('€') || text.includes('mio') || text.includes('tsd') || /\d+[km]/.test(text)) {
            return 'permanent';
        }

        return 'unknown';
    },

    /**
     * Generate unique ID for a transfer row
     */
    generateTransferId(row) {
        const playerLink = row.querySelector('a[href*="/profil/spieler/"]');
        if (playerLink) {
            const idMatch = playerLink.href.match(/spieler\/(\d+)/);
            if (idMatch) return idMatch[1];
        }
        return `temp_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Extract player data from a transfer row
     */
    extractPlayerData(row) {
        // En kritik nokta: Oyuncu linkini doğru yakalamak
        // Transfermarkt'ta mevki bazen link olabilir ama oyuncu linki her zaman /profil/spieler/ içerir
        const playerLink = row.querySelector('a[href*="/profil/spieler/"]');
        if (!playerLink) return null;

        // İSİM ÇAKTIRMASI (Root Fix): 
        // 1. Önce linkin 'title' özniteliğine bak (En temiz, pozisyon içermeyen isim buradadır)
        // 2. Eğer title yoksa linkin içindeki <b> veya <strong> etiketine bak
        // 3. Hiçbiri yoksa URL slug'ından temizle
        let playerName = playerLink.getAttribute('title') || '';

        if (!playerName || playerName === 'Profil') {
            const boldText = playerLink.querySelector('b, strong');
            if (boldText) {
                playerName = boldText.textContent.trim();
            } else {
                // URL'den çek: /isim/profil/spieler/123
                const parts = playerLink.href.split('/');
                const slug = parts[parts.indexOf('profil') - 1];
                playerName = slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
            }
        }

        // Mevkiyi asla isimle karıştırma: Mevki .inline-table'ın 2. satırındadır
        const position = this.extractPosition(row);

        const playerImg = row.querySelector('.bilderrahmen-fixed, img.bilderrahmen');
        const cells = row.querySelectorAll('td');
        const idMatch = playerLink.href.match(/spieler\/(\d+)/);

        return {
            id: idMatch ? idMatch[1] : null,
            name: playerName.trim(),
            profileUrl: playerLink.href,
            imageUrl: playerImg ? playerImg.src : null,
            age: this.extractAge(row),
            nationality: this.extractNationality(row),
            position: position,
            fromClub: this.extractClub(row, 'from'),
            toClub: this.extractClub(row, 'to'),
            marketValue: cells.length > 2 ? cells[cells.length - 2]?.textContent.trim() : null,
            fee: cells.length > 1 ? cells[cells.length - 1]?.textContent.trim() : null
        };
    },

    /**
     * Yaş bilgisini hücrelerden bulur
     */
    extractAge(row) {
        const cells = row.querySelectorAll('td');
        for (const cell of cells) {
            const text = cell.textContent.trim();
            if (/^\d{2}$/.test(text) && parseInt(text) >= 14 && parseInt(text) <= 50) {
                return parseInt(text);
            }
        }
        return null;
    },

    /**
     * Uyruk bilgisini çeker
     */
    extractNationality(row) {
        const flagImg = row.querySelector('.flaggenrahmen');
        return flagImg ? (flagImg.title || flagImg.alt) : null;
    },

    /**
     * Mevki bilgisini çeker (Okla gösterilen kısım)
     */
    extractPosition(row) {
        // Görseldeki okların gösterdiği yer: .inline-table'ın ikinci satırı
        const inlineTable = row.querySelector('.inline-table');
        if (inlineTable) {
            const trs = inlineTable.querySelectorAll('tr');
            // Genelde [0] isim, [1] mevkidir
            if (trs.length >= 2) {
                const posStr = trs[1].textContent.trim();
                // Eğer çok uzunsa muhtemelen başka bir şeydir, kısa tut
                return posStr.length < 40 ? posStr : posStr.substring(0, 40);
            }
        }

        // Bazı sayfalarda td sınıfı 'posrela'dır
        const posCell = row.querySelector('.posrela');
        if (posCell) {
            const trs = posCell.querySelectorAll('tr');
            if (trs.length >= 2) return trs[1].textContent.trim();
        }

        return null;
    },

    /**
     * Extract club information
     * @param {Element} row - Table row element
     * @param {string} type - 'from' or 'to'
     * @returns {Object|null}
     */
    extractClub(row, type) {
        const clubs = row.querySelectorAll('.vereinprofil_tooltip');
        const index = type === 'from' ? 0 : 1;

        if (clubs[index]) {
            const img = clubs[index].querySelector('img');
            const link = clubs[index].closest('a');

            return {
                name: clubs[index].textContent.trim() || (img ? img.alt : null),
                logoUrl: img ? img.src : null,
                profileUrl: link ? link.href : null
            };
        }
        return null;
    },

    /**
     * Create DOM element with attributes
     * @param {string} tag - HTML tag name
     * @param {Object} attrs - Attributes object
     * @param {string|Element|Array} children - Child content
     * @returns {Element}
     */
    createElement(tag, attrs = {}, children = null) {
        const el = document.createElement(tag);

        for (const [key, value] of Object.entries(attrs)) {
            if (key === 'className') {
                el.className = value;
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.substring(2).toLowerCase(), value);
            } else if (key === 'dataset' && typeof value === 'object') {
                Object.assign(el.dataset, value);
            } else {
                el.setAttribute(key, value);
            }
        }

        if (children) {
            if (typeof children === 'string') {
                el.textContent = children;
            } else if (Array.isArray(children)) {
                children.forEach(child => {
                    if (child) el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
                });
            } else {
                el.appendChild(children);
            }
        }

        return el;
    },

    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function}
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in ms
     * @returns {Function}
     */
    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Download file
     * @param {string} content - File content
     * @param {string} filename - File name
     * @param {string} mimeType - MIME type
     */
    downloadFile(content, filename, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}
