/**
 * Smart-TM Storage Manager
 * Chrome Storage API wrapper for managing extension data
 */

const StorageManager = {
  // Storage keys
  KEYS: {
    WATCHLIST: 'smarttm_watchlist',
    FILTERS: 'smarttm_filters',
    NOTES: 'smarttm_notes',
    SETTINGS: 'smarttm_settings',
    LEAGUE_RADAR: 'smarttm_league_radar',
    NOTIFICATIONS: 'smarttm_notifications',
    TRANSFER_CACHE: 'smarttm_transfer_cache'
  },

  // Default settings
  DEFAULT_SETTINGS: {
    transferColors: true,
    scoutButtons: true,
    notesModule: true,
    notifyWatchlist: true,
    notifyLeagues: false
  },

  /**
   * Get data from storage
   * @param {string} key - Storage key
   * @returns {Promise<any>}
   */
  async get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] || null);
      });
    });
  },

  /**
   * Set data to storage
   * @param {string} key - Storage key
   * @param {any} value - Data to store
   * @returns {Promise<void>}
   */
  async set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  },

  /**
   * Remove data from storage
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  async remove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove([key], resolve);
    });
  },

  /**
   * Clear all extension data
   * @returns {Promise<void>}
   */
  async clearAll() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(resolve);
    });
  },

  // ===== WATCHLIST METHODS =====

  /**
   * Get watchlist
   * @returns {Promise<Array>}
   */
  async getWatchlist() {
    const watchlist = await this.get(this.KEYS.WATCHLIST);
    return watchlist || [];
  },

  /**
   * Add player to watchlist
   * @param {Object} player - Player data
   * @returns {Promise<void>}
   */
  async addToWatchlist(player) {
    const watchlist = await this.getWatchlist();
    const exists = watchlist.some(p => p.id === player.id);

    if (!exists) {
      player.addedAt = new Date().toISOString();
      watchlist.push(player);
      await this.set(this.KEYS.WATCHLIST, watchlist);
    }
  },

  /**
   * Remove player from watchlist
   * @param {string} playerId - Player ID
   * @returns {Promise<void>}
   */
  async removeFromWatchlist(playerId) {
    const watchlist = await this.getWatchlist();
    const filtered = watchlist.filter(p => p.id !== playerId);
    await this.set(this.KEYS.WATCHLIST, filtered);
  },

  /**
   * Check if player is in watchlist
   * @param {string} playerId - Player ID
   * @returns {Promise<boolean>}
   */
  async isInWatchlist(playerId) {
    const watchlist = await this.getWatchlist();
    return watchlist.some(p => p.id === playerId);
  },

  // ===== FILTERS METHODS =====

  /**
   * Get saved filters
   * @returns {Promise<Array>}
   */
  async getFilters() {
    const filters = await this.get(this.KEYS.FILTERS);
    return filters || [];
  },

  /**
   * Save a filter
   * @param {Object} filter - Filter configuration
   * @returns {Promise<void>}
   */
  async saveFilter(filter) {
    const filters = await this.getFilters();
    filter.id = `filter_${Date.now()}`;
    filter.createdAt = new Date().toISOString();
    filters.push(filter);
    await this.set(this.KEYS.FILTERS, filters);
  },

  /**
   * Delete a filter
   * @param {string} filterId - Filter ID
   * @returns {Promise<void>}
   */
  async deleteFilter(filterId) {
    const filters = await this.getFilters();
    const filtered = filters.filter(f => f.id !== filterId);
    await this.set(this.KEYS.FILTERS, filtered);
  },

  /**
   * Update a filter
   * @param {string} filterId - Filter ID
   * @param {Object} updates - Updated filter data
   * @returns {Promise<void>}
   */
  async updateFilter(filterId, updates) {
    const filters = await this.getFilters();
    const index = filters.findIndex(f => f.id === filterId);

    if (index !== -1) {
      filters[index] = { ...filters[index], ...updates };
      await this.set(this.KEYS.FILTERS, filters);
    }
  },

  // ===== NOTES METHODS =====

  /**
   * Get all notes
   * @returns {Promise<Object>}
   */
  async getNotes() {
    const notes = await this.get(this.KEYS.NOTES);
    return notes || {};
  },

  /**
   * Get note for a specific transfer
   * @param {string} transferId - Transfer ID
   * @returns {Promise<string|null>}
   */
  async getNote(transferId) {
    const notes = await this.getNotes();
    return notes[transferId] || null;
  },

  /**
   * Save note for a transfer
   * @param {string} transferId - Transfer ID
   * @param {string} noteText - Note content
   * @returns {Promise<void>}
   */
  async saveNote(transferId, noteText) {
    const notes = await this.getNotes();
    notes[transferId] = {
      text: noteText,
      updatedAt: new Date().toISOString()
    };
    await this.set(this.KEYS.NOTES, notes);
  },

  /**
   * Delete note for a transfer
   * @param {string} transferId - Transfer ID
   * @returns {Promise<void>}
   */
  async deleteNote(transferId) {
    const notes = await this.getNotes();
    delete notes[transferId];
    await this.set(this.KEYS.NOTES, notes);
  },

  // ===== SETTINGS METHODS =====

  /**
   * Get settings
   * @returns {Promise<Object>}
   */
  async getSettings() {
    const settings = await this.get(this.KEYS.SETTINGS);
    return { ...this.DEFAULT_SETTINGS, ...settings };
  },

  /**
   * Update settings
   * @param {Object} updates - Settings to update
   * @returns {Promise<void>}
   */
  async updateSettings(updates) {
    const settings = await this.getSettings();
    const newSettings = { ...settings, ...updates };
    await this.set(this.KEYS.SETTINGS, newSettings);
  },

  // ===== LEAGUE RADAR METHODS =====

  /**
   * Get league radar configuration
   * @returns {Promise<Array>}
   */
  async getLeagueRadar() {
    const radar = await this.get(this.KEYS.LEAGUE_RADAR);
    return radar || [];
  },

  /**
   * Set league radar configuration
   * @param {Array} leagues - Array of league identifiers
   * @returns {Promise<void>}
   */
  async setLeagueRadar(leagues) {
    await this.set(this.KEYS.LEAGUE_RADAR, leagues);
  },

  // ===== TRANSFER CACHE METHODS =====

  /**
   * Get all cached transfers
   * @returns {Promise<Object>}
   */
  async getTransferCache() {
    const cache = await this.get(this.KEYS.TRANSFER_CACHE);
    return cache || { transfers: [], lastUpdated: null, pageUrls: [] };
  },

  /**
   * Add transfers to cache (merges with existing)
   * @param {Array} transfers - Array of transfer objects
   * @param {string} pageUrl - URL of the page where transfers were collected
   * @returns {Promise<void>}
   */
  async addToTransferCache(transfers, pageUrl) {
    const cache = await this.getTransferCache();

    // Add page URL if not already tracked
    if (!cache.pageUrls.includes(pageUrl)) {
      cache.pageUrls.push(pageUrl);
    }

    // Merge transfers: Map based on ID to keep the most complete/recent data
    const transferMap = new Map();
    cache.transfers.forEach(t => transferMap.set(t.id, t));

    transfers.forEach(t => {
      if (t.id) {
        // Eğer zaten varsa ama gelen veri daha doluysa (örn: resim veya uyruk eklenmişse) güncelle
        const existing = transferMap.get(t.id);
        if (!existing || (t.name && t.position)) {
          transferMap.set(t.id, { ...existing, ...t });
        }
      }
    });

    cache.transfers = Array.from(transferMap.values());
    cache.lastUpdated = new Date().toISOString();

    await this.set(this.KEYS.TRANSFER_CACHE, cache);
  },

  /**
   * Query cached transfers with filters
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Array>}
   */
  async queryCachedTransfers(filters = {}) {
    const cache = await this.getTransferCache();
    let results = [...cache.transfers];

    // Age filter
    if (filters.ageMin) {
      results = results.filter(t => t.age && t.age >= filters.ageMin);
    }
    if (filters.ageMax) {
      results = results.filter(t => t.age && t.age <= filters.ageMax);
    }

    // Position filter
    if (filters.position) {
      results = results.filter(t => t.position === filters.position);
    }

    // Nationality filter
    if (filters.nationality) {
      results = results.filter(t => t.nationality === filters.nationality);
    }

    // Transfer type filter
    if (filters.transferType) {
      results = results.filter(t => {
        const fee = (t.fee || '').toLowerCase();
        if (filters.transferType === 'loan') return fee.includes('kiralık') || fee.includes('loan');
        if (filters.transferType === 'free') return fee.includes('ablösefrei') || fee.includes('free') || fee === '-';
        if (filters.transferType === 'permanent') return !fee.includes('kiralık') && !fee.includes('loan') && fee !== '-' && !fee.includes('ablösefrei');
        return true;
      });
    }

    // Sort
    if (filters.sortBy) {
      results.sort((a, b) => {
        const direction = filters.sortDirection === 'desc' ? -1 : 1;
        switch (filters.sortBy) {
          case 'age':
            return ((a.age || 0) - (b.age || 0)) * direction;
          case 'name':
            return (a.name || '').localeCompare(b.name || '') * direction;
          case 'position':
            return (a.position || '').localeCompare(b.position || '') * direction;
          default:
            return 0;
        }
      });
    }

    return results;
  },

  /**
   * Get unique values from cache for filter dropdowns
   * @returns {Promise<Object>}
   */
  async getCacheFilterOptions() {
    const cache = await this.getTransferCache();
    const positions = new Set();
    const nationalities = new Set();

    for (const transfer of cache.transfers) {
      if (transfer.position) positions.add(transfer.position);
      if (transfer.nationality) nationalities.add(transfer.nationality);
    }

    return {
      positions: Array.from(positions).sort(),
      nationalities: Array.from(nationalities).sort(),
      totalTransfers: cache.transfers.length,
      lastUpdated: cache.lastUpdated,
      pagesScanned: cache.pageUrls.length
    };
  },

  /**
   * Clear transfer cache
   * @returns {Promise<void>}
   */
  async clearTransferCache() {
    await this.set(this.KEYS.TRANSFER_CACHE, { transfers: [], lastUpdated: null, pageUrls: [] });
  },

  // ===== EXPORT METHODS =====

  /**
   * Export all data as JSON
   * @returns {Promise<Object>}
   */
  async exportAllData() {
    const [watchlist, filters, notes, settings, leagueRadar] = await Promise.all([
      this.getWatchlist(),
      this.getFilters(),
      this.getNotes(),
      this.getSettings(),
      this.getLeagueRadar()
    ]);

    return {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      data: {
        watchlist,
        filters,
        notes,
        settings,
        leagueRadar
      }
    };
  },

  /**
   * Export watchlist as CSV
   * @returns {Promise<string>}
   */
  async exportWatchlistCSV() {
    const watchlist = await this.getWatchlist();

    if (watchlist.length === 0) {
      return 'No data to export';
    }

    const headers = ['Name', 'Age', 'Position', 'Nationality', 'Current Club', 'Market Value', 'Added At', 'Profile URL'];
    const rows = watchlist.map(p => [
      p.name || '',
      p.age || '',
      p.position || '',
      p.nationality || '',
      p.club || '',
      p.marketValue || '',
      p.addedAt || '',
      p.profileUrl || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
  }
};

// Make available globally (for both content script and popup)
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}
