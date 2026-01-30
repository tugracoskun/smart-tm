/**
 * Smart-TM Export Functions
 * Handles CSV and JSON export functionality
 */

const ExportManager = {
    /**
     * Export watchlist to CSV file
     */
    async exportWatchlistCSV() {
        const watchlist = await StorageManager.getWatchlist();

        if (watchlist.length === 0) {
            alert('Watchlist boş! Dışa aktarılacak oyuncu yok.');
            return;
        }

        const headers = [
            'İsim',
            'Yaş',
            'Pozisyon',
            'Uyruk',
            'Kulüp',
            'Piyasa Değeri',
            'Eklenme Tarihi',
            'Profil URL'
        ];

        const rows = watchlist.map(player => [
            player.name || '',
            player.age || '',
            player.position || '',
            player.nationality || '',
            player.club || '',
            player.marketValue || '',
            player.addedAt ? new Date(player.addedAt).toLocaleDateString('tr-TR') : '',
            player.profileUrl || ''
        ]);

        const csvContent = [
            headers.join(';'),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        ].join('\r\n');

        // Add BOM for Excel compatibility with Turkish characters
        const BOM = '\uFEFF';
        this.downloadFile(BOM + csvContent, 'smart-tm-watchlist.csv', 'text/csv;charset=utf-8');
    },

    /**
     * Export all data to JSON file
     */
    async exportAllDataJSON() {
        const data = await StorageManager.exportAllData();

        const jsonContent = JSON.stringify(data, null, 2);
        this.downloadFile(jsonContent, 'smart-tm-full-backup.json', 'application/json');
    },

    /**
     * Export notes to JSON file
     */
    async exportNotesJSON() {
        const notes = await StorageManager.getNotes();

        if (Object.keys(notes).length === 0) {
            alert('Kaydedilmiş not yok!');
            return;
        }

        const jsonContent = JSON.stringify({
            exportedAt: new Date().toISOString(),
            notes: notes
        }, null, 2);

        this.downloadFile(jsonContent, 'smart-tm-notes.json', 'application/json');
    },

    /**
     * Export filters to JSON file
     */
    async exportFiltersJSON() {
        const filters = await StorageManager.getFilters();

        if (filters.length === 0) {
            alert('Kaydedilmiş filtre yok!');
            return;
        }

        const jsonContent = JSON.stringify({
            exportedAt: new Date().toISOString(),
            filters: filters
        }, null, 2);

        this.downloadFile(jsonContent, 'smart-tm-filters.json', 'application/json');
    },

    /**
     * Import data from JSON file
     * @param {File} file - JSON file to import
     */
    async importFromJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    // Check if it's a full backup
                    if (data.data) {
                        if (data.data.watchlist) {
                            await StorageManager.set(StorageManager.KEYS.WATCHLIST, data.data.watchlist);
                        }
                        if (data.data.filters) {
                            await StorageManager.set(StorageManager.KEYS.FILTERS, data.data.filters);
                        }
                        if (data.data.notes) {
                            await StorageManager.set(StorageManager.KEYS.NOTES, data.data.notes);
                        }
                        if (data.data.settings) {
                            await StorageManager.set(StorageManager.KEYS.SETTINGS, data.data.settings);
                        }
                        if (data.data.leagueRadar) {
                            await StorageManager.set(StorageManager.KEYS.LEAGUE_RADAR, data.data.leagueRadar);
                        }
                    }

                    // Check if it's just notes
                    if (data.notes && !data.data) {
                        const existingNotes = await StorageManager.getNotes();
                        const mergedNotes = { ...existingNotes, ...data.notes };
                        await StorageManager.set(StorageManager.KEYS.NOTES, mergedNotes);
                    }

                    // Check if it's just filters
                    if (data.filters && !data.data) {
                        const existingFilters = await StorageManager.getFilters();
                        const mergedFilters = [...existingFilters, ...data.filters];
                        await StorageManager.set(StorageManager.KEYS.FILTERS, mergedFilters);
                    }

                    resolve({ success: true, message: 'İçe aktarma başarılı!' });
                } catch (error) {
                    reject({ success: false, message: 'Geçersiz dosya formatı: ' + error.message });
                }
            };

            reader.onerror = () => {
                reject({ success: false, message: 'Dosya okunamadı.' });
            };

            reader.readAsText(file);
        });
    },

    /**
     * Download file helper
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
    },

    /**
     * Generate scouting report for a player
     * @param {Object} player - Player data
     * @returns {string} HTML report
     */
    generateScoutingReport(player) {
        const reportDate = new Date().toLocaleDateString('tr-TR');

        return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Scout Raporu - ${player.name}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #0871B0; border-bottom: 3px solid #EFAB14; padding-bottom: 10px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
    .info-item { background: #f5f5f5; padding: 15px; border-radius: 8px; }
    .info-label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; }
    .info-value { font-size: 18px; color: #333; margin-top: 5px; }
    .notes { background: #fffde7; padding: 20px; border-left: 4px solid #EFAB14; margin-top: 30px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <h1>🎯 Scout Raporu</h1>
  <h2>${player.name}</h2>
  
  <div class="info-grid">
    <div class="info-item">
      <div class="info-label">Yaş</div>
      <div class="info-value">${player.age || '-'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Pozisyon</div>
      <div class="info-value">${player.position || '-'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Uyruk</div>
      <div class="info-value">${player.nationality || '-'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Kulüp</div>
      <div class="info-value">${player.club || '-'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Piyasa Değeri</div>
      <div class="info-value">${player.marketValue || '-'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Transfermarkt</div>
      <div class="info-value"><a href="${player.profileUrl}" target="_blank">Profile Git</a></div>
    </div>
  </div>
  
  <div class="notes">
    <h3>📝 Scout Notları</h3>
    <p>${player.notes || 'Henüz not eklenmedi.'}</p>
  </div>
  
  <div class="footer">
    <p>Bu rapor Smart-TM Scout Extension tarafından ${reportDate} tarihinde oluşturulmuştur.</p>
  </div>
</body>
</html>`;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.ExportManager = ExportManager;
}
