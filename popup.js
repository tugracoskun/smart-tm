/**
 * Smart-TM Popup Script
 * Handles popup UI interactions
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize
  await initTabs();
  await loadWatchlist();
  await loadSearchPanel();
  await loadFilters();
  await loadSettings();
  await loadNotificationSettings();
  await loadNotes();

  // Set up event listeners
  setupEventListeners();
});

/**
 * Initialize tab navigation
 */
async function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetPanel = tab.dataset.tab;

      // Update active states
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`${targetPanel}-panel`).classList.add('active');
    });
  });
}

/**
 * Load and display watchlist
 */
async function loadWatchlist() {
  const watchlist = await StorageManager.getWatchlist();
  const container = document.getElementById('watchlist-items');
  const countBadge = document.getElementById('watchlist-count');

  countBadge.textContent = watchlist.length;

  if (watchlist.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <p>Henüz takip edilen oyuncu yok</p>
        <span>Transfermarkt'ta bir oyuncunun yanındaki ⭐ ikonuna tıklayarak watchlist'e ekleyebilirsiniz.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = watchlist.map(player => `
    <div class="watchlist-item" data-player-id="${player.id}">
      <div class="player-avatar">
        ${player.imageUrl
      ? `<img src="${player.imageUrl}" alt="${player.name}">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>`
    }
      </div>
      <div class="player-info">
        <span class="player-name">${player.name}</span>
        <span class="player-details">${player.position || ''} • ${player.age || '?'} yaş • ${player.club || ''}</span>
      </div>
      <div class="player-actions">
        <button class="btn-icon open-profile" title="Profile Git" data-url="${player.profileUrl}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
        <button class="btn-icon remove-player" title="Listeden Çıkar" data-player-id="${player.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  container.querySelectorAll('.open-profile').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: btn.dataset.url });
    });
  });

  container.querySelectorAll('.remove-player').forEach(btn => {
    btn.addEventListener('click', async () => {
      await StorageManager.removeFromWatchlist(btn.dataset.playerId);
      loadWatchlist();
    });
  });
}

/**
 * Load and initialize the global search panel
 */
async function loadSearchPanel() {
  const cacheOptions = await StorageManager.getCacheFilterOptions();

  // Update stats
  document.getElementById('cache-count').textContent = cacheOptions.totalTransfers;
  document.getElementById('total-cached').textContent = cacheOptions.totalTransfers;
  document.getElementById('pages-scanned').textContent = cacheOptions.pagesScanned;

  // Populate position dropdown
  const positionSelect = document.getElementById('search-position');
  if (positionSelect) {
    positionSelect.innerHTML = '<option value="">Tümü</option>' +
      cacheOptions.positions.map(p => `<option value="${p}">${p}</option>`).join('');
  }

  // Populate nationality dropdown
  const nationalitySelect = document.getElementById('search-nationality');
  if (nationalitySelect) {
    nationalitySelect.innerHTML = '<option value="">Tümü</option>' +
      cacheOptions.nationalities.map(n => `<option value="${n}">${n}</option>`).join('');
  }

  // If there are cached transfers, show initial results
  if (cacheOptions.totalTransfers > 0) {
    await performSearch();
  }
}

/**
 * Perform search on cached transfers
 */
async function performSearch() {
  const filters = {
    position: document.getElementById('search-position')?.value || '',
    nationality: document.getElementById('search-nationality')?.value || '',
    ageMin: parseInt(document.getElementById('search-age-min')?.value) || null,
    ageMax: parseInt(document.getElementById('search-age-max')?.value) || null
  };

  // Handle sorting
  const sortValue = document.getElementById('search-sort')?.value || '';
  if (sortValue) {
    const [sortBy, sortDirection] = sortValue.split('-');
    filters.sortBy = sortBy;
    filters.sortDirection = sortDirection;
  }

  const results = await StorageManager.queryCachedTransfers(filters);
  renderSearchResults(results);
}

/**
 * Render search results
 */
function renderSearchResults(transfers) {
  const container = document.getElementById('search-results');

  if (transfers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <p>Sonuç bulunamadı</p>
        <span>Filtreleri değiştirerek tekrar deneyin.</span>
      </div>
    `;
    return;
  }

  // Limit to first 50 results
  const displayTransfers = transfers.slice(0, 50);

  container.innerHTML = `
    <div class="results-count">${transfers.length} sonuç bulundu ${transfers.length > 50 ? '(ilk 50 gösteriliyor)' : ''}</div>
    <div class="search-results-list">
      ${displayTransfers.map(t => `
        <div class="result-item" data-player-id="${t.id}">
          <div class="result-info">
            <span class="result-name">${t.name || 'İsimsiz'}</span>
            <span class="result-details">
              ${t.position || ''} ${t.age ? `• ${t.age} yaş` : ''} ${t.nationality ? `• ${t.nationality}` : ''}
            </span>
          </div>
          <div class="result-actions">
            <a href="${t.profileUrl}" target="_blank" class="btn-icon" title="Profile Git">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Load and display saved filters
 */
async function loadFilters() {
  const filters = await StorageManager.getFilters();
  const container = document.getElementById('filter-items');

  if (filters.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <p>Kayıtlı filtre yok</p>
        <span>Transfermarkt sayfasındaki Smart Filters panelinden filtre kaydetebilirsiniz.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = filters.map(filter => `
    <div class="filter-item" data-filter-id="${filter.id}">
      <div class="filter-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
      </div>
      <div class="filter-info">
        <span class="filter-name">${filter.name}</span>
        <span class="filter-summary">${getFilterSummary(filter)}</span>
      </div>
      <div class="player-actions">
        <button class="btn-icon apply-filter" title="Filtreyi Uygula" data-filter-id="${filter.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <button class="btn-icon delete-filter" title="Filtreyi Sil" data-filter-id="${filter.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  // Add event listeners for apply
  container.querySelectorAll('.apply-filter').forEach(btn => {
    btn.addEventListener('click', async () => {
      const filterId = btn.dataset.filterId;
      const filter = filters.find(f => f.id === filterId);

      if (filter) {
        // Send message to content script to apply filter
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url.includes('transfermarkt')) {
          chrome.tabs.sendMessage(tab.id, { action: 'applyFilter', filter });
        }
      }
    });
  });

  // Add event listeners for delete
  container.querySelectorAll('.delete-filter').forEach(btn => {
    btn.addEventListener('click', async () => {
      await StorageManager.deleteFilter(btn.dataset.filterId);
      loadFilters();
    });
  });
}

/**
 * Get human-readable filter summary
 */
function getFilterSummary(filter) {
  const parts = [];

  if (filter.ageMin || filter.ageMax) {
    parts.push(`Yaş: ${filter.ageMin || '?'}-${filter.ageMax || '?'}`);
  }
  if (filter.leagues && filter.leagues.length > 0) {
    parts.push(`${filter.leagues.length} lig`);
  }
  if (filter.transferTypes && filter.transferTypes.length > 0) {
    parts.push(filter.transferTypes.join(', '));
  }

  return parts.length > 0 ? parts.join(' • ') : 'Tüm transferler';
}

/**
 * Load settings
 */
async function loadSettings() {
  const settings = await StorageManager.getSettings();

  document.getElementById('setting-colors').checked = settings.transferColors;
  document.getElementById('setting-scout-youtube').checked = settings.scoutYoutube;
  document.getElementById('setting-scout-fbref').checked = settings.scoutFbref;
  document.getElementById('setting-scout-wyscout').checked = settings.scoutWyscout;
  document.getElementById('setting-notes').checked = settings.notesModule;
}

/**
 * Load notification settings
 */
async function loadNotificationSettings() {
  const settings = await StorageManager.getSettings();
  const leagueRadar = await StorageManager.getLeagueRadar();

  document.getElementById('notify-watchlist').checked = settings.notifyWatchlist;
  document.getElementById('notify-leagues').checked = settings.notifyLeagues;

  // Set league radar checkboxes
  leagueRadar.forEach(league => {
    const checkbox = document.querySelector(`input[data-league="${league}"]`);
    if (checkbox) checkbox.checked = true;
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Watchlist search
  const searchInput = document.getElementById('watchlist-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(async (e) => {
      const query = e.target.value.toLowerCase();
      const watchlist = await StorageManager.getWatchlist();
      const filtered = query
        ? watchlist.filter(p => p.name.toLowerCase().includes(query))
        : watchlist;

      renderWatchlistItems(filtered);
    }, 300));
  }

  // Notes search
  const notesSearchInput = document.getElementById('notes-search');
  if (notesSearchInput) {
    notesSearchInput.addEventListener('input', debounce(async (e) => {
      const query = e.target.value.toLowerCase();
      const notes = await StorageManager.getNotes();

      const notesList = [];
      const noteKeys = Object.keys(notes);

      for (const id of noteKeys) {
        notesList.push({
          id: id,
          ...notes[id]
        });
      }

      const filtered = query
        ? notesList.filter(n => n.text.toLowerCase().includes(query))
        : notesList;

      renderNotesItems(filtered);
    }, 300));
  }

  // Settings toggles

  document.getElementById('setting-colors')?.addEventListener('change', async (e) => {
    await StorageManager.updateSettings({ transferColors: e.target.checked });
    notifyContentScript('settingsChanged');
  });

  document.getElementById('setting-scout-youtube')?.addEventListener('change', async (e) => {
    await StorageManager.updateSettings({ scoutYoutube: e.target.checked });
    notifyContentScript('settingsChanged');
  });

  document.getElementById('setting-scout-fbref')?.addEventListener('change', async (e) => {
    await StorageManager.updateSettings({ scoutFbref: e.target.checked });
    notifyContentScript('settingsChanged');
  });

  document.getElementById('setting-scout-wyscout')?.addEventListener('change', async (e) => {
    await StorageManager.updateSettings({ scoutWyscout: e.target.checked });
    notifyContentScript('settingsChanged');
  });



  document.getElementById('setting-notes')?.addEventListener('change', async (e) => {
    await StorageManager.updateSettings({ notesModule: e.target.checked });
    notifyContentScript('settingsChanged');
  });

  // Notification settings
  document.getElementById('notify-watchlist')?.addEventListener('change', async (e) => {
    await StorageManager.updateSettings({ notifyWatchlist: e.target.checked });
  });

  document.getElementById('notify-leagues')?.addEventListener('change', async (e) => {
    await StorageManager.updateSettings({ notifyLeagues: e.target.checked });
  });

  // League radar checkboxes
  document.querySelectorAll('#league-radar input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', async () => {
      const selectedLeagues = Array.from(
        document.querySelectorAll('#league-radar input[type="checkbox"]:checked')
      ).map(cb => cb.dataset.league);

      await StorageManager.setLeagueRadar(selectedLeagues);
    });
  });

  // Global Search event listeners
  document.getElementById('search-apply')?.addEventListener('click', performSearch);

  // Sync Data Button
  document.getElementById('sync-data-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('sync-data-btn');
    btn.classList.add('loading');
    btn.style.opacity = '0.5';

    chrome.runtime.sendMessage({ action: 'syncTransfers' }, async (response) => {
      btn.classList.remove('loading');
      btn.style.opacity = '1';

      if (response && response.success) {
        alert(`${response.count} yeni transfer cache'e eklendi!`);
        await loadSearchPanel();
      } else {
        alert(response?.message || 'Senkronizasyon başarısız. Lütfen bir Transfermarkt sekmesinin açık olduğundan emin olun.');
      }
    });
  });

  document.getElementById('search-reset')?.addEventListener('click', async () => {
    document.getElementById('search-position').value = '';
    document.getElementById('search-nationality').value = '';
    document.getElementById('search-age-min').value = '';
    document.getElementById('search-age-max').value = '';
    document.getElementById('search-sort').value = '';
    await performSearch();
  });

  document.getElementById('clear-cache')?.addEventListener('click', async () => {
    if (confirm('Tüm önbelleğe alınmış transferler silinecek. Emin misiniz?')) {
      await StorageManager.clearTransferCache();
      await loadSearchPanel();
    }
  });

  // Export buttons - use ExportManager for proper exports
  document.getElementById('export-csv')?.addEventListener('click', async () => {
    try {
      await ExportManager.exportWatchlistCSV();
    } catch (e) {
      console.error('CSV export error:', e);
      alert('Dışa aktarma hatası: ' + e.message);
    }
  });

  document.getElementById('export-json')?.addEventListener('click', async () => {
    try {
      await ExportManager.exportAllDataJSON();
    } catch (e) {
      console.error('JSON export error:', e);
      alert('Dışa aktarma hatası: ' + e.message);
    }
  });

  // Clear all data
  document.getElementById('clear-all-data')?.addEventListener('click', async () => {
    if (confirm('Tüm verileriniz silinecek. Emin misiniz?')) {
      await StorageManager.clearAll();
      location.reload();
    }
  });

  // Import button
  document.getElementById('import-btn')?.addEventListener('click', () => {
    document.getElementById('import-file')?.click();
  });

  // Import file handler
  document.getElementById('import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await ExportManager.importFromJSON(file);
      if (result.success) {
        alert(result.message);
        location.reload();
      }
    } catch (error) {
      alert(error.message || 'İçe aktarma hatası!');
    }

    e.target.value = '';
  });

  // SofaScore Import Button
  document.getElementById('import-sofascore')?.addEventListener('click', async () => {
    const btn = document.getElementById('import-sofascore');
    btn.style.opacity = '0.5';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      if (tab.url.includes('sofascore.com')) {
        chrome.tabs.sendMessage(tab.id, { action: 'scanSofaScore' }, async (response) => {
          btn.style.opacity = '1';
          if (chrome.runtime.lastError) {
            alert('Hata: Sayfaya erişilemedi. Lütfen sayfayı yenileyip tekrar deneyin.');
            return;
          }

          if (response && response.success && response.data) {
            await StorageManager.addToWatchlist(response.data);
            alert(`${response.data.name} watchlist'e eklendi!`);
            await loadWatchlist();
          } else {
            alert(response?.message || 'İçe aktarma başarısız.');
          }
        });
      } else {
        alert('Bu özellik sadece SofaScore profil sayfalarında çalışır.');
        btn.style.opacity = '1';
      }
    } catch (e) {
      console.error(e);
      alert('Beklenmeyen bir hata oluştu');
      btn.style.opacity = '1';
    }
  });
}

/**
 * Render watchlist items (for search filtering)
 */
async function renderWatchlistItems(players) {
  const container = document.getElementById('watchlist-items');

  if (players.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Sonuç bulunamadı</p>
      </div>
    `;
    return;
  }

  container.innerHTML = players.map(player => `
    <div class="watchlist-item" data-player-id="${player.id}">
      <div class="player-avatar">
        ${player.imageUrl
      ? `<img src="${player.imageUrl}" alt="${player.name}">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>`
    }
      </div>
      <div class="player-info">
        <span class="player-name">${player.name}</span>
        <span class="player-details">${player.position || ''} • ${player.age || '?'} yaş • ${player.club || ''}</span>
      </div>
      <div class="player-actions">
        <button class="btn-icon open-profile" title="Profile Git" data-url="${player.profileUrl}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
        <button class="btn-icon remove-player" title="Listeden Çıkar" data-player-id="${player.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Notify content script of changes
 */
async function notifyContentScript(action) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url.includes('transfermarkt')) {
      chrome.tabs.sendMessage(tab.id, { action });
    }
  } catch (e) {
    console.log('Could not notify content script:', e);
  }
}

/**
 * Download file utility
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Debounce utility
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Load notes items
 */
async function loadNotes() {
  const notes = await StorageManager.getNotes();
  // Note: notes is an object { id: { text, updatedAt, playerName? } }

  // Convert to array
  const notesList = Object.keys(notes).map(id => ({
    id,
    ...notes[id]
  }));

  // Sort by updated at desc
  notesList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  renderNotesItems(notesList);
}

/**
 * Render notes items
 */
function renderNotesItems(notesList) {
  const container = document.getElementById('notes-items');
  if (!container) return; // Guard clause

  if (notesList.length === 0) {
    container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <p>Henüz not yok</p>
            <span>Transfer listelerinde oyuncuların yanındaki kalem ikonuna tıklayarak not ekleyebilirsiniz.</span>
          </div>
       `;
    return;
  }

  container.innerHTML = notesList.map(note => `
     <div class="watchlist-item" data-note-id="${note.id}" style="align-items: flex-start;">
        <div class="player-info" style="width: 100%; flex: 1;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; align-items: center;">
                <span class="player-name" style="color: #EFAB14;">${note.playerName || 'Oyuncu #' + note.id}</span>
                <span class="player-details">${new Date(note.updatedAt).toLocaleDateString('tr-TR')}</span>
            </div>
            <p style="font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 5px; margin-bottom:0; white-space: pre-wrap; line-height: 1.4;">${note.text}</p>
        </div>
        <div class="player-actions" style="margin-left: 10px; margin-top: 0;">
           <button class="btn-icon open-profile" title="Profile Git" data-url="https://www.transfermarkt.com.tr/s/profil/spieler/${note.id}">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
           </button>
           <button class="btn-icon delete-note" title="Notu Sil" data-note-id="${note.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
           </button>
        </div>
     </div>
    `).join('');

  // Event listeners
  container.querySelectorAll('.open-profile').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: btn.dataset.url });
    });
  });

  container.querySelectorAll('.delete-note').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Notu silmek istediğinize emin misiniz?')) {
        await StorageManager.deleteNote(btn.dataset.noteId);
        loadNotes();
      }
    });
  });
}
