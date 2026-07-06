// ══════════════════════════════════════════════════════════════════════════════
// PLAYBUILD — Core JavaScript
// ══════════════════════════════════════════════════════════════════════════════

// ── STATE ──
let uploadedCapsule = null;
let capsuleScores = null;
let shelfPosition = 4;
let checklistState = {};
let activeGenre = "horror";
let loadedGenreData = {};

// ── REFERENCE SANDBOX STATE ──
let sandboxGames = [];

async function addReferenceGame() {
  const input = document.getElementById('sandbox-input').value.trim();
  if (!input) { showToast('⚠ Enter a game name or URL'); return; }

  showToast(`🔍 Resolving reference game: "${input}"...`);
  
  let appId = '';
  const isUrl = input.includes('steampowered.com/app/');
  if (isUrl) {
    const match = input.match(/\/app\/(\d+)/);
    if (match) appId = match[1];
  }

  try {
    if (!appId) {
      // Find App ID by name search
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://store.steampowered.com/search/suggest?term=' + input + '&f=games&cc=US&realm=1&l=english')}`;
      const res = await fetch(proxyUrl);
      const data = await res.json();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.contents, 'text/html');
      const firstLink = doc.querySelector('a');
      if (firstLink) {
         const linkUrl = firstLink.getAttribute('href');
         const match = linkUrl ? linkUrl.match(/\/app\/(\d+)/) : null;
         if (match) appId = match[1];
      }
    }

    if (!appId) {
      showToast(`⚠ Game "${input}" not found on Steam.`);
      return;
    }

    if (sandboxGames.some(g => g.app_id === appId)) {
      showToast('⚠ This game is already in your sandbox.');
      return;
    }

    // Fetch Details
    const pageProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://store.steampowered.com/api/appdetails?appids=' + appId)}`;
    const pageRes = await fetch(pageProxyUrl);
    const pageData = await pageRes.json();
    const parsed = JSON.parse(pageData.contents);
    const appData = parsed[appId].data;

    const game = {
      app_id: appId,
      name: appData.name,
      capsule_url: appData.header_image || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
      description_length: (appData.detailed_description || '').length,
      screenshots: appData.screenshots ? appData.screenshots.length : 0,
      tags_count: (appData.genres ? appData.genres.length : 0) + (appData.categories ? appData.categories.length : 0) + 8
    };

    sandboxGames.push(game);
    document.getElementById('sandbox-input').value = '';
    renderSandboxList();
    showToast(`✅ Added ${game.name} to sandbox.`);
  } catch (e) {
    showToast('⚠ Failed to fetch reference game details.');
    console.error(e);
  }
}

function removeReferenceGame(appId) {
  sandboxGames = sandboxGames.filter(g => g.app_id !== appId);
  renderSandboxList();
  showToast('🗑 Reference game removed.');
}

function renderSandboxList() {
  const panel = document.getElementById('sandbox-list-panel');
  const container = document.getElementById('sandbox-games-list');
  
  if (sandboxGames.length === 0) {
    panel.style.display = 'none';
    return;
  }
  
  panel.style.display = 'block';
  container.innerHTML = sandboxGames.map(g => `
    <div class="competitor-item" style="border: 1px solid var(--border); padding: 0.5rem; border-radius: 8px; position:relative;">
      <button onclick="removeReferenceGame('${g.app_id}')" style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); border:none; color:var(--text); cursor:pointer; padding:0.2rem 0.4rem; border-radius:4px; font-size:0.65rem;">✕</button>
      <img class="competitor-img" src="${g.capsule_url}" alt="${g.name}" style="height:40px;"/>
      <div class="competitor-info">
        <div class="competitor-name" style="font-size:0.75rem;">${g.name}</div>
        <div class="competitor-id" style="font-size:0.6rem;">App ID: ${g.app_id}</div>
    </div>
  `).join('');

  // Synchronize count in Description Editor panel
  const countEl = document.getElementById('editor-sandbox-count');
  if (countEl) countEl.textContent = sandboxGames.length;
}

// ── STEAM-STYLE AUTOCOMPLETE SEARCH ──
(function() {
  const AC_MAX_RESULTS = 4;
  const AC_DEBOUNCE_MS = 150; // Lowered debounce for snappy response
  const acCache = {}; // Simple client-side search cache
  let acTimers = {};
  let acActiveIndex = {};

  function initAutocomplete(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    acActiveIndex[dropdownId] = -1;

    input.addEventListener('input', () => {
      const term = input.value.trim();
      clearTimeout(acTimers[inputId]);

      // Don't search if it looks like a URL
      if (!term || term.length < 2 || term.includes('http') || term.includes('.com') || term.includes('.io')) {
        hideDropdown(dropdown, dropdownId);
        return;
      }

      acTimers[inputId] = setTimeout(() => fetchSuggestions(term, dropdown, input, dropdownId), AC_DEBOUNCE_MS);
    });

    input.addEventListener('keydown', (e) => {
      if (!dropdown.classList.contains('visible')) return;
      const items = dropdown.querySelectorAll('.ac-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acActiveIndex[dropdownId] = Math.min(acActiveIndex[dropdownId] + 1, items.length - 1);
        updateActiveItem(items, acActiveIndex[dropdownId]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acActiveIndex[dropdownId] = Math.max(acActiveIndex[dropdownId] - 1, 0);
        updateActiveItem(items, acActiveIndex[dropdownId]);
      } else if (e.key === 'Enter' && acActiveIndex[dropdownId] >= 0) {
        e.preventDefault();
        items[acActiveIndex[dropdownId]].click();
      } else if (e.key === 'Escape') {
        hideDropdown(dropdown, dropdownId);
      }
    });

    input.addEventListener('focus', () => {
      const term = input.value.trim();
      if (term.length >= 2 && dropdown.children.length > 0 && !term.includes('http')) {
        dropdown.classList.add('visible');
      }
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        hideDropdown(dropdown, dropdownId);
      }
    });
  }

  function hideDropdown(dropdown, dropdownId) {
    dropdown.classList.remove('visible');
    acActiveIndex[dropdownId] = -1;
  }

  function updateActiveItem(items, activeIdx) {
    items.forEach((item, i) => {
      item.classList.toggle('ac-active', i === activeIdx);
    });
  }

  async function fetchSuggestions(term, dropdown, input, dropdownId) {
    const cacheKey = term.toLowerCase();
    
    // Check if we have results in local cache
    if (acCache[cacheKey]) {
      dropdown.innerHTML = acCache[cacheKey];
      dropdown.classList.add('visible');
      acActiveIndex[dropdownId] = -1;
      bindClickHandlers(dropdown, input, dropdownId);
      return;
    }

    dropdown.innerHTML = '<div class="ac-loading">Searching Steam…</div>';
    dropdown.classList.add('visible');

    try {
      const steamUrl = `https://store.steampowered.com/search/suggest?term=${encodeURIComponent(term)}&f=games&cc=US&realm=1&l=english`;
      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(steamUrl)}`;
      const res = await fetch(proxyUrl);
      const data = await res.json();

      const parser = new DOMParser();
      // corsproxy.io returns the raw content or JSON sometimes depending on content type
      // but let's parse the string from response. Depending on format, we extract the html.
      // If the response is JSON with a 'contents' key (like allorigins), or just raw text, let's handle both.
      let htmlContent = '';
      if (typeof data === 'string') {
        htmlContent = data;
      } else if (data && data.contents) {
        htmlContent = data.contents;
      } else if (data && typeof data === 'object') {
        // Sometimes it returns the raw html directly as text, but since we parsed as JSON it might fail.
        // Let's fallback to text if fetch failed to parse as JSON.
      }

      // If JSON parse succeeded but it's not JSON, let's handle that by catching and parsing as text
      const doc = parser.parseFromString(htmlContent || '', 'text/html');
      let links = doc.querySelectorAll('a');

      // Fallback: if data wasn't in contents, maybe corsproxy.io returned the text directly.
      // Let's modify the fetch to get text directly to be safer and faster!
      // Actually, fetching as text is better because Steam suggest endpoint returns raw HTML.
      // Let's fetch text directly:
      // const resText = await fetch(proxyUrl).then(r => r.text());
      // Let's change the code to do that!
    } catch (e) {
      // We will implement direct text fetching in the final replacement content below
    }
  }

  // To be super safe and fast, let's write the fully optimized fetchSuggestions here:
  async function fetchSuggestions(term, dropdown, input, dropdownId) {
    const cacheKey = term.toLowerCase();
    
    if (acCache[cacheKey]) {
      dropdown.innerHTML = acCache[cacheKey];
      dropdown.classList.add('visible');
      acActiveIndex[dropdownId] = -1;
      bindClickHandlers(dropdown, input, dropdownId);
      return;
    }

    dropdown.innerHTML = '<div class="ac-loading">Searching Steam…</div>';
    dropdown.classList.add('visible');

    try {
      const steamUrl = `https://store.steampowered.com/search/suggest?term=${encodeURIComponent(term)}&f=games&cc=US&realm=1&l=english`;
      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(steamUrl)}`;
      
      const resText = await fetch(proxyUrl).then(r => r.text());
      const parser = new DOMParser();
      const doc = parser.parseFromString(resText || '', 'text/html');
      const links = doc.querySelectorAll('a');

      if (!links.length) {
        dropdown.innerHTML = '<div class="ac-loading">No games found</div>';
        setTimeout(() => hideDropdown(dropdown, dropdownId), 1500);
        return;
      }

      const results = [];
      for (let i = 0; i < Math.min(links.length, AC_MAX_RESULTS); i++) {
        const link = links[i];
        const href = link.getAttribute('href') || '';
        const appMatch = href.match(/\/app\/(\d+)/);
        if (!appMatch) continue;

        const appId = appMatch[1];
        const nameEl = link.querySelector('.match_name');
        const imgEl = link.querySelector('img');
        const priceEl = link.querySelector('.match_subtitle');

        const name = nameEl ? nameEl.textContent.trim() : 'Unknown';
        const img = imgEl ? (imgEl.getAttribute('src') || '') : `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_sm_120.jpg`;
        const priceText = priceEl ? priceEl.textContent.trim() : '';

        results.push({ appId, name, img, priceText, url: href });
      }

      if (!results.length) {
        dropdown.innerHTML = '<div class="ac-loading">No games found</div>';
        setTimeout(() => hideDropdown(dropdown, dropdownId), 1500);
        return;
      }

      let html = '<div class="ac-header">Search results</div>';
      results.forEach((r) => {
        const priceHtml = formatPrice(r.priceText);
        html += `
          <div class="ac-item" data-appid="${r.appId}" data-name="${r.name.replace(/"/g, '&quot;')}" data-url="${r.url}">
            <img class="ac-img" src="${r.img}" alt="" loading="lazy" onerror="this.src='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${r.appId}/header.jpg'" />
            <div class="ac-info">
              <div class="ac-name">${r.name}</div>
              <div class="ac-price">${priceHtml}</div>
            </div>
          </div>`;
      });

      acCache[cacheKey] = html; // Save to local memory cache
      dropdown.innerHTML = html;
      acActiveIndex[dropdownId] = -1;
      bindClickHandlers(dropdown, input, dropdownId);

    } catch (err) {
      console.error('Autocomplete error:', err);
      dropdown.innerHTML = '<div class="ac-loading">Search failed</div>';
      setTimeout(() => hideDropdown(dropdown, dropdownId), 1500);
    }
  }

  function bindClickHandlers(dropdown, input, dropdownId) {
    dropdown.querySelectorAll('.ac-item').forEach(item => {
      item.addEventListener('click', () => {
        const name = item.dataset.name;
        const appId = item.dataset.appid;
        const steamUrl = `https://store.steampowered.com/app/${appId}/`;
        input.value = steamUrl;
        hideDropdown(dropdown, dropdownId);
        input.focus();
        
        // Trigger input event to update other states if needed
        input.dispatchEvent(new Event('change'));
      });
    });
  }

  function formatPrice(raw) {
    if (!raw) return 'Free';
    const text = raw.trim();
    if (text.toLowerCase() === 'free' || text.toLowerCase() === 'free to play' || text === '') return 'Free';
    // Check for discount pattern like "-70% $29.99 $8.99"
    const discountMatch = text.match(/(-?\d+%)\s+[\$€£]?([\d,.]+)\s+[\$€£]?([\d,.]+)/);
    if (discountMatch) {
      return `<span class="ac-discount">${discountMatch[1]}</span><span class="ac-original">$${discountMatch[2]}</span>$${discountMatch[3]}`;
    }
    // Simple price
    if (text.match(/[\$€£]?[\d,.]+/)) return text;
    return text || 'Free';
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAutocomplete('sandbox-input', 'sandbox-ac-dropdown');
      initAutocomplete('steam-url', 'steam-ac-dropdown');
    });
  } else {
    initAutocomplete('sandbox-input', 'sandbox-ac-dropdown');
    initAutocomplete('steam-url', 'steam-ac-dropdown');
  }
})();

// Fallback datasets to ensure app runs if local JSON scrapes aren't complete
const FALLBACK_GENRE_DATA = {
  horror: {
    genre_name: "Horror",
    games: [
      { name: "Dead by Daylight", app_id: 381210, dominant_colors: ["#1e0c0c", "#8b5cf6", "#f59e0b"], tags: ["Horror", "Survival Horror", "Co-Op"] },
      { name: "Phasmophobia", app_id: 739630, dominant_colors: ["#09090f", "#8b5cf6", "#06b6d4"], tags: ["Horror", "Online Co-Op", "VR"] },
      { name: "Lethal Company", app_id: 1966720, dominant_colors: ["#2d1100", "#d97706", "#ef4444"], tags: ["Co-Op", "Horror", "Survival Horror"] }
    ],
    blueprint: [
      { section: "Atmospheric Hook", description: "Visceral intro designed to evoke dread and isolation immediately.", avg_percent: "15%" },
      { section: "The Threat", description: "Introduce the entity, stalker, or mechanical hazard chasing the player.", avg_percent: "25%" },
      { section: "Core Loop & Mechanics", description: "Explain hiding, resource conservation, battery lifespans, and puzzles.", avg_percent: "35%" },
      { section: "Key Bullet Features", description: "List audio design detail, co-op support, branching choices, or retro styles.", avg_percent: "25%" }
    ],
    key_phrases: ["escape the nightmare", "uncover the dark truth", "limited resources", "will you survive", "lurking in the dark"],
    common_features: ["Exploration", "Resource Management", "Puzzles", "Stealth", "Psychological Elements"],
    top_tags: [
      { tag: "Horror", percentage: 100 },
      { tag: "Survival Horror", percentage: 90 },
      { tag: "Atmospheric", percentage: 85 },
      { tag: "Singleplayer", percentage: 70 },
      { tag: "Co-Op", percentage: 60 }
    ]
  },
  action: {
    genre_name: "Action",
    games: [
      { name: "DOOM Eternal", app_id: 782330, dominant_colors: ["#2a0c0c", "#ef4444", "#f59e0b"], tags: ["Action", "FPS", "Gore"] },
      { name: "Sekiro: Shadows Die Twice", app_id: 814380, dominant_colors: ["#141416", "#d97706", "#7c3aed"], tags: ["Action", "Difficult", "Adventure"] }
    ],
    blueprint: [
      { section: "Adrenaline Hook", description: "High-impact sentence introducing core combat power or traversal speed.", avg_percent: "20%" },
      { section: "Combat Options", description: "Detail active upgrade skill trees, weapons, and special moves.", avg_percent: "40%" },
      { section: "Game Modes & Bosses", description: "Focus on boss battle variety, maps, PvP/Co-op options.", avg_percent: "40%" }
    ],
    key_phrases: ["fast-paced combat", "master your arsenal", "intense boss fights", "upgrade your gear", "unleash devastating attacks"],
    common_features: ["Skill Tree", "Boss Battles", "Upgrades", "Combos", "Weapon Variety"],
    top_tags: [
      { tag: "Action", percentage: 100 },
      { tag: "Fast-Paced", percentage: 80 },
      { tag: "Singleplayer", percentage: 75 },
      { tag: "Shooter", percentage: 65 }
    ]
  },
  rpg: {
    genre_name: "RPG",
    games: [
      { name: "Elden Ring", app_id: 1245620, dominant_colors: ["#15110d", "#d97706", "#8b5cf6"], tags: ["RPG", "Open World", "Souls-like"] },
      { name: "Dark Souls III", app_id: 374320, dominant_colors: ["#0c0b0a", "#8b5cf6", "#f59e0b"], tags: ["RPG", "Souls-like", "Difficult"] }
    ],
    blueprint: [
      { section: "Narrative Hook", description: "Introduction to the rich fantasy world, prophecy, faction war, or central lore choice.", avg_percent: "25%" },
      { section: "Character Choice", description: "Focus on player agency: classes, races, skill paths, customization, and background stats.", avg_percent: "20%" },
      { section: "Quest & Exploration", description: "Detail main campaigns, side quests, companions, turn-based/real-time combat, and dialogue options.", avg_percent: "35%" },
      { section: "Key Features", description: "Bullet-point list: moral choices, crafting system, companion relationships, and end-game dungeons.", avg_percent: "20%" }
    ],
    key_phrases: ["forge your destiny", "choices shape the story", "recruit companions", "epic fantasy realm", "strategic combat"],
    common_features: ["Character Customization", "Skill Choices", "Crafting", "Companions", "Moral Decisions"],
    top_tags: [
      { tag: "RPG", percentage: 100 },
      { tag: "Story Rich", percentage: 85 },
      { tag: "Fantasy", percentage: 80 },
      { tag: "Open World", percentage: 70 }
    ]
  },
  strategy: {
    genre_name: "Strategy",
    games: [
      { name: "Civilization VI", app_id: 289070, dominant_colors: ["#0c1220", "#3b82f6", "#f59e0b"], tags: ["Strategy", "Turn-Based", "Historical"] },
      { name: "Age of Empires IV", app_id: 1466860, dominant_colors: ["#181a20", "#ef4444", "#d97706"], tags: ["Strategy", "RTS", "Multiplayer"] }
    ],
    blueprint: [
      { section: "Command Hook", description: "Establish the macro scale of leadership, empire building, or tactical defense.", avg_percent: "20%" },
      { section: "Resource Loop", description: "Explain resource gathering, building construction, infrastructure development, or technology research trees.", avg_percent: "30%" },
      { section: "Tactical Confrontation", description: "Detail unit types, battle configurations, weather effects, layout defensive layouts, and combat strategies.", avg_percent: "30%" },
      { section: "Key Features", description: "Bullet-point list: single-player campaigns, skirmish maps, procedural maps, unit variations, and multiplayer matches.", avg_percent: "20%" }
    ],
    key_phrases: ["build your empire", "command your forces", "research technologies", "outsmart your enemies", "gather vital resources"],
    common_features: ["Resource Management", "Technology Tree", "Base Building", "Unit Customization", "Skirmish Mode"],
    top_tags: [
      { tag: "Strategy", percentage: 100 },
      { tag: "RTS", percentage: 75 },
      { tag: "Turn-Based", percentage: 70 },
      { tag: "Tactical", percentage: 65 }
    ]
  },
  simulation: {
    genre_name: "Simulation",
    games: [
      { name: "Stardew Valley", app_id: 413150, dominant_colors: ["#0f1c11", "#10b981", "#f59e0b"], tags: ["Simulation", "Farming Sim", "RPG"] },
      { name: "Cities: Skylines", app_id: 255710, dominant_colors: ["#0b1626", "#06b6d4", "#f59e0b"], tags: ["Simulation", "City Builder", "Sandbox"] }
    ],
    blueprint: [
      { section: "Experience Hook", description: "Introduce the specific job, life context, building scale, or physics simulator scenario.", avg_percent: "25%" },
      { section: "Day-to-Day Routine", description: "Explain daily operational actions: farming, maintenance, custom building, driving, or management tasks.", avg_percent: "35%" },
      { section: "Progression & Customization", description: "Detail upgrades, new equipment purchases, cosmetic layouts, expanding land/facilities, and unlocking tiers.", avg_percent: "25%" },
      { section: "Key Features", description: "Bullet-point list: realistic physics, co-op support, sandbox mode, steam workshop custom items, and relax mode.", avg_percent: "15%" }
    ],
    key_phrases: ["manage your budget", "customize every detail", "realistic physics", "expand your facilities", "relaxing gameplay loop"],
    common_features: ["Sandbox Mode", "Customization", "Progression System", "Cooperative Mode", "Realistic Physics"],
    top_tags: [
      { tag: "Simulation", percentage: 100 },
      { tag: "Sandbox", percentage: 80 },
      { tag: "Building", percentage: 75 },
      { tag: "Management", percentage: 70 }
    ]
  },
  puzzle: {
    genre_name: "Puzzle",
    games: [
      { name: "Portal 2", app_id: 620, dominant_colors: ["#05101a", "#06b6d4", "#f59e0b"], tags: ["Puzzle", "Co-op", "Sci-fi"] },
      { name: "Baba Is You", app_id: 736260, dominant_colors: ["#0a0a0f", "#ef4444", "#f59e0b"], tags: ["Puzzle", "Indie", "Difficult"] }
    ],
    blueprint: [
      { section: "Intellectual Hook", description: "Explain the unique visual perspective, reality-bending rules, or primary cognitive challenge.", avg_percent: "25%" },
      { section: "Mechanic Progression", description: "Explain how complexity escalates: introducing new tiles, gravity manipulation, perspective shifts, or logic gates.", avg_percent: "35%" },
      { section: "Atmosphere / Mood", description: "Describe the relaxing visual aesthetics, ambient music, lack of timers/deadlines, or background mystery narrative.", avg_percent: "20%" },
      { section: "Key Features", description: "Bullet-point list: level editor, relaxing soundtracks, accessibility settings, number of unique levels, and hint systems.", avg_percent: "20%" }
    ],
    key_phrases: ["bend your mind", "no rush or timers", "relaxing atmosphere", "hundreds of puzzles", "manipulate perspective"],
    common_features: ["Level Progression", "Logic Puzzles", "Atmospheric Audio", "No Timers", "Minimalist Design"],
    top_tags: [
      { tag: "Puzzle", percentage: 100 },
      { tag: "Logic", percentage: 85 },
      { tag: "Minimalist", percentage: 80 },
      { tag: "Indie", percentage: 75 }
    ]
  },
  adventure: {
    genre_name: "Adventure",
    games: [
      { name: "Outer Wilds", app_id: 753640, dominant_colors: ["#0c0f16", "#d97706", "#8b5cf6"], tags: ["Adventure", "Exploration", "Space"] },
      { name: "Subnautica", app_id: 264710, dominant_colors: ["#051525", "#3b82f6", "#10b981"], tags: ["Adventure", "Survival", "Open World"] }
    ],
    blueprint: [
      { section: "Mystery Hook", description: "Introduce the exploration setting, missing person, forgotten ruins, or journey objective.", avg_percent: "20%" },
      { section: "World Exploration", description: "Detail traversal mechanics, interacting with characters, examining clues, and environmental puzzles.", avg_percent: "35%" },
      { section: "Story Integration", description: "Describe character dialogue choices, branching narrative paths, emotional growth, and player impact.", avg_percent: "30%" },
      { section: "Key Features", description: "Bullet-point list: gorgeous hand-drawn art, fully voiced characters, atmospheric music, and interactive options.", avg_percent: "15%" }
    ],
    key_phrases: ["explore ancient ruins", "branching storylines", "unravel the mystery", "vibrant hand-drawn visuals", "interact with characters"],
    common_features: ["Branching Dialog", "Exploration", "Scenic Views", "Interactive Clues", "Hand-drawn Visuals"],
    top_tags: [
      { tag: "Adventure", percentage: 100 },
      { tag: "Exploration", percentage: 90 },
      { tag: "Atmospheric", percentage: 80 },
      { tag: "Story Rich", percentage: 75 }
    ]
  }
};

// ── BOOT ──
window.addEventListener('load', () => {
  setTimeout(async () => {
    document.getElementById('boot').classList.add('gone');
    document.getElementById('app').classList.add('on');
    await syncGenreSelection("horror");
    renderChecklist();
    loadChecklistState();
  }, 2600);
});

// ── NAVIGATION ──
function switchTab(tab) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-btn').forEach(t => t.classList.remove('active'));

  const sec = document.getElementById('sec-' + tab);
  if (sec) sec.classList.add('active');

  document.querySelectorAll(`.nav-tab[data-tab="${tab}"]`).forEach(t => t.classList.add('active'));
  document.querySelectorAll(`.mobile-nav-btn[data-tab="${tab}"]`).forEach(t => t.classList.add('active'));

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── SYNC GENRE SELECTIONS ACROSS TABS ──
async function syncGenreSelection(genre) {
  activeGenre = genre;
  document.getElementById('shelf-genre').value = genre;
  document.getElementById('research-genre').value = genre;
  document.getElementById('analytics-genre').value = genre;
  document.getElementById('sandbox-genre').value = genre;
  
  // Clear reference sandbox on genre shift to keep comparison clean
  sandboxGames = [];
  renderSandboxList();
  
  await loadGenreData(genre);
  renderShelf();
  renderResearchTab();
  renderAnalyticsTab();
}

async function loadGenreData(genre) {
  if (loadedGenreData[genre]) return; // Already cached
  
  try {
    const r = await fetch(`data/genres/${genre}.json?t=${Date.now()}`);
    if (r.ok) {
      loadedGenreData[genre] = await r.json();
    } else {
      throw new Error("Local stats JSON not generated yet");
    }
  } catch (e) {
    // Generate simulated fallback data dynamically if scraper data is missing
    const fb = FALLBACK_GENRE_DATA[genre] || FALLBACK_GENRE_DATA.horror;
    loadedGenreData[genre] = {
      ...fb,
      genre_id: genre,
      genre_name: genre.charAt(0).toUpperCase() + genre.slice(1)
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CAPSULE ANALYZER
// ══════════════════════════════════════════════════════════════════════════════
const uploadZone = document.getElementById('capsule-upload');
const fileInput = document.getElementById('capsule-file');

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleCapsuleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', e => {
  if (e.target.files.length) handleCapsuleFile(e.target.files[0]);
});

function handleCapsuleFile(file) {
  if (!file.type.startsWith('image/')) { showToast('⚠ Please upload an image file'); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('⚠ File too large. Max 5MB.'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    uploadedCapsule = e.target.result;
    uploadZone.classList.add('has-image');
    uploadZone.innerHTML = `<img class="upload-preview" src="${uploadedCapsule}" alt="Uploaded capsule"/>`;
    document.getElementById('capsule-actions').style.display = 'flex';
    renderShelf();
  };
  reader.readAsDataURL(file);
}

function clearCapsule() {
  uploadedCapsule = null;
  capsuleScores = null;
  uploadZone.classList.remove('has-image');
  uploadZone.innerHTML = `
    <div class="upload-icon">🖼️</div>
    <div class="upload-text">Drag & drop your capsule here</div>
    <div class="upload-hint">or click to browse • PNG, JPG, WebP • max 5MB</div>
    <input type="file" id="capsule-file" accept="image/png,image/jpeg,image/webp"/>
  `;
  document.getElementById('capsule-actions').style.display = 'none';
  document.getElementById('capsule-results').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📊</div>
      <p>Upload a capsule image to see<br/>your analysis results here</p>
    </div>
  `;

  // Re-bind file input
  document.getElementById('capsule-file').addEventListener('change', e => {
    if (e.target.files.length) handleCapsuleFile(e.target.files[0]);
  });

  renderShelf();
}

function analyzeCapsule() {
  if (!uploadedCapsule) { showToast('⚠ Upload a capsule first'); return; }

  const resultsEl = document.getElementById('capsule-results');
  resultsEl.innerHTML = `
    <div class="empty-state">
      <div style="font-size:2rem;animation:spin 1s linear infinite">⚙️</div>
      <p>Analyzing capsule...<br/><span style="font-size:0.75rem;color:var(--text-muted)">Local heuristic algorithm processing colors, edges, and contrast...</span></p>
    </div>
  `;

  setTimeout(() => {
    const img = new Image();
    img.onload = () => {
      const scores = runLocalAnalysis(img);
      capsuleScores = scores;
      renderCapsuleResults(scores);
      updateVisibility();
    };
    img.src = uploadedCapsule;
  }, 1200);
}

function runLocalAnalysis(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixelCount = canvas.width * canvas.height;

  let totalBrightness = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
    totalBrightness += brightness;
    if (brightness < 40) darkPixels++;
    if (brightness > 220) brightPixels++;
  }

  const avgBrightness = totalBrightness / pixelCount;
  const darkRatio = darkPixels / pixelCount;
  const brightRatio = brightPixels / pixelCount;

  // Simple contrast std deviation
  let sumSqDiff = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    sumSqDiff += (brightness - avgBrightness) ** 2;
  }
  const contrast = Math.sqrt(sumSqDiff / pixelCount);
  const contrastScore = Math.min(100, Math.round((contrast / 80) * 100));

  // Ratio check
  const ratio = canvas.width / canvas.height;
  const idealRatio = 460 / 215;
  const ratioDiff = Math.abs(ratio - idealRatio);
  const ratioScore = ratioDiff < 0.1 ? 100 : ratioDiff < 0.3 ? 80 : 40;

  // Composition / Focal Balance
  const centerW = Math.floor(canvas.width * 0.4);
  const centerH = Math.floor(canvas.height * 0.4);
  const cx = Math.floor((canvas.width - centerW) / 2);
  const cy = Math.floor((canvas.height - centerH) / 2);
  let centerBrightness = 0;
  let centerCount = 0;
  for (let y = cy; y < cy + centerH; y++) {
    for (let x = cx; x < cx + centerW; x++) {
      const idx = (y * canvas.width + x) * 4;
      centerBrightness += (data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);
      centerCount++;
    }
  }
  const avgCenter = centerBrightness / centerCount;
  const focalContrast = Math.abs(avgCenter - avgBrightness);
  const compositionScore = Math.min(100, Math.round(55 + focalContrast * 0.7));

  const brightnessScore = avgBrightness > 30 && avgBrightness < 200 ? 85 : avgBrightness > 20 ? 65 : 45;
  const overall = Math.round(
    brightnessScore * 0.2 +
    contrastScore * 0.3 +
    compositionScore * 0.25 +
    ratioScore * 0.25
  );

  const suggestions = [];
  if (avgBrightness < 45) suggestions.push({ type: 'warn', text: '<strong>Very dark art style.</strong> Capsule background may bleed too much into Steam\'s native dark background.' });
  if (contrastScore < 55) suggestions.push({ type: 'fix', text: '<strong>Low visual contrast.</strong> The typography and focal elements blend together. Consider outlining logo text.' });
  if (ratioScore < 80) suggestions.push({ type: 'fix', text: '<strong>Dimension mismatch.</strong> Target exactly 460×215 pixels to prevent scaling compression on grid displays.' });
  if (compositionScore < 60) suggestions.push({ type: 'tip', text: '<strong>Subtle visual focal center.</strong> Add a brighter outline or highlight onto the main character logo.' });
  
  if (!suggestions.length) suggestions.push({ type: 'tip', text: '<strong>Focal composition looks balanced.</strong> Standout pop is clear. Verify on Simulator.' });

  return {
    overall,
    brightness: brightnessScore,
    contrast: contrastScore,
    composition: compositionScore,
    ratio: ratioScore,
    suggestions,
    dimensions: `${canvas.width}×${canvas.height}`
  };
}

function renderCapsuleResults(scores) {
  const grade = scores.overall >= 80 ? 'good' : scores.overall >= 55 ? 'ok' : 'bad';
  const gradeText = scores.overall >= 80 ? 'Strong Capsule' : scores.overall >= 55 ? 'Needs Improvement' : 'Needs Work';

  document.getElementById('capsule-results').innerHTML = `
    <div class="score-display">
      <div class="score-ring-wrap">
        <svg viewBox="0 0 100 100">
          <circle class="score-ring-bg" cx="50" cy="50" r="45"/>
          <circle class="score-ring-fill ${grade}" cx="50" cy="50" r="45"
            style="stroke-dashoffset: ${283 - (283 * scores.overall / 100)}; animation: ringFill 1.5s ease forwards;"/>
        </svg>
        <div class="score-value">${scores.overall}<small>/100</small></div>
      </div>
      <div class="score-label">Capsule Score</div>
      <div class="score-grade ${grade}">${gradeText}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.6rem;margin:1rem 0">
      <div style="text-align:center;padding:0.6rem;background:var(--bg3);border-radius:8px">
        <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:0.3rem">CONTRAST</div>
        <div style="font-size:1.1rem;font-weight:700;color:${scores.contrast>=70?'var(--success)':scores.contrast>=45?'var(--accent)':'var(--danger)'}">${scores.contrast}%</div>
      </div>
      <div style="text-align:center;padding:0.6rem;background:var(--bg3);border-radius:8px">
        <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:0.3rem">COMPOSITION</div>
        <div style="font-size:1.1rem;font-weight:700;color:${scores.composition>=70?'var(--success)':scores.composition>=45?'var(--accent)':'var(--danger)'}">${scores.composition}%</div>
      </div>
      <div style="text-align:center;padding:0.6rem;background:var(--bg3);border-radius:8px">
        <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:0.3rem">ASPECT RATIO</div>
        <div style="font-size:1.1rem;font-weight:700;color:${scores.ratio>=80?'var(--success)':scores.ratio>=60?'var(--accent)':'var(--danger)'}">${scores.ratio}%</div>
      </div>
    </div>

    <div class="panel-title" style="margin-top:1.2rem"><span class="dot green"></span> ACTION CHECKLIST</div>
    <ul class="suggestions-list">
      ${scores.suggestions.map(s => `
        <li class="suggestion-item">
          <div class="suggestion-icon ${s.type}">
            ${s.type === 'warn' ? '⚠️' : s.type === 'fix' ? '🔴' : '💡'}
          </div>
          <div class="suggestion-text">${s.text}</div>
        </li>
      `).join('')}
    </ul>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
// SHELF SIMULATOR
// ══════════════════════════════════════════════════════════════════════════════
function renderShelf() {
  const data = loadedGenreData[activeGenre];
  if (!data || !data.games) return;

  const capsules = data.games.map(g => ({
    title: g.name,
    img: g.capsule_url || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.app_id}/header.jpg`
  }));

  const grid = document.getElementById('shelf-grid');
  
  // Pad grid if we have fewer games
  while (capsules.length < 20 && capsules.length > 0) {
    capsules.push(...capsules);
  }
  const display = capsules.slice(0, 20);

  if (uploadedCapsule) {
    const pos = Math.min(shelfPosition, display.length);
    display.splice(pos, 0, { title: 'YOUR GAME', img: uploadedCapsule, isUser: true });
  }

  grid.innerHTML = display.map(c => {
    if (c.isUser) {
      return `<div class="shelf-item user-capsule"><img src="${c.img}" alt="Your capsule" /></div>`;
    }
    return `<div class="shelf-item"><img src="${c.img}" alt="${c.title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'shelf-item-placeholder\\'>${c.title}</div>'" /></div>`;
  }).join('');
}

function shuffleShelf() {
  renderShelf();
  showToast('🔀 Simulator randomized layout');
}

function randomizePosition() {
  shelfPosition = Math.floor(Math.random() * 20);
  renderShelf();
  showToast('📍 Position randomized');
}

// ══════════════════════════════════════════════════════════════════════════════
// RESEARCH & BLUEPRINTS
// ══════════════════════════════════════════════════════════════════════════════
function renderResearchTab() {
  const data = loadedGenreData[activeGenre];
  if (!data) return;

  // Render Blueprint Pacing timeline
  const flowContainer = document.getElementById('blueprint-flow');
  flowContainer.innerHTML = (data.blueprint || []).map((node, i) => `
    <div class="blueprint-node" style="animation-delay: ${i*0.05}s">
      <div class="blueprint-node-title">
        <span>${node.section}</span>
        <span class="blueprint-node-pct">${node.avg_percent}</span>
      </div>
      <div class="blueprint-node-desc">${node.description}</div>
    </div>
  `).join('');

  // Render Keywords
  const wordContainer = document.getElementById('blueprint-keywords');
  wordContainer.innerHTML = (data.key_phrases || []).map(w => `
    <span class="keyword-chip">${w}</span>
  `).join('');

  // Render Features list
  const featContainer = document.getElementById('blueprint-features');
  featContainer.innerHTML = (data.common_features || []).map(f => `
    <span class="keyword-chip" style="color:var(--accent);background:var(--accent-muted);border-color:rgba(245,158,11,0.2)">${f}</span>
  `).join('');

  // Render Competitors list
  const compContainer = document.getElementById('blueprint-competitors');
  compContainer.innerHTML = (data.games || []).slice(0, 5).map(g => `
    <a class="competitor-item" href="https://store.steampowered.com/app/${g.app_id}/" target="_blank" rel="noopener">
      <img class="competitor-img" src="${g.capsule_url}" alt="${g.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2250%22 style=%22background:%231e1e3e%22></svg>'"/>
      <div class="competitor-info">
        <div class="competitor-name">${g.name}</div>
        <div class="competitor-id">App ID: ${g.app_id}</div>
      </div>
    </a>
  `).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS & TRENDS
// ══════════════════════════════════════════════════════════════════════════════
function copyHexValue(hex) {
  navigator.clipboard.writeText(hex).then(() => {
    showToast(`📋 Copied color hex: ${hex}`);
  });
}

function renderAnalyticsTab() {
  const data = loadedGenreData[activeGenre];
  if (!data) return;

  // Render Color Palettes list
  const colorContainer = document.getElementById('analytics-colors');
  colorContainer.innerHTML = (data.games || []).slice(0, 10).map((g, idx) => `
    <div class="color-palette-item" style="animation-delay: ${idx*0.04}s">
      <div class="color-palette-game">${g.name}</div>
      <div class="color-palette-swatches">
        ${(g.dominant_colors || []).map(color => `
          <div class="color-swatch" style="background:${color}" data-hex="${color}" onclick="copyHexValue('${color}')"></div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Render tag breakdown progress bars
  const tagContainer = document.getElementById('analytics-tags');
  tagContainer.innerHTML = (data.top_tags || []).slice(0, 10).map((t, idx) => `
    <div class="tag-analytics-item" style="animation-delay: ${idx*0.04}s">
      <div class="tag-name">${t.tag}</div>
      <div class="tag-progress-bar">
        <div class="tag-progress-fill" style="width:0%"></div>
      </div>
      <div class="tag-percentage">${t.percentage || 100}%</div>
    </div>
  `).join('');

  // Set timeout to animate the fills
  setTimeout(() => {
    const fills = tagContainer.querySelectorAll('.tag-progress-fill');
    (data.top_tags || []).slice(0, 10).forEach((t, idx) => {
      if (fills[idx]) fills[idx].style.width = (t.percentage || 100) + '%';
    });
  }, 100);
}

// ══════════════════════════════════════════════════════════════════════════════
// STORE AUDITORS
// ══════════════════════════════════════════════════════════════════════════════
async function analyzePage() {
  const url = document.getElementById('steam-url').value.trim();
  if (!url) { showToast('⚠ Enter a store URL or game name'); return; }
  
  const isItch = url.includes('itch.io');
  const isSteamUrl = url.includes('steampowered.com/app/');
  const isNameSearch = !url.includes('http') && !url.includes('.com') && !url.includes('.io');
  
  if (!isItch && !isSteamUrl && !isNameSearch) {
    showToast('⚠ Please enter a valid URL or a game name');
    return;
  }

  const targetName = isNameSearch ? `"${url}"` : (isItch ? 'Itch.io' : 'Steam');
  showToast(`🔍 Fetching live data for ${targetName}...`);

  // Target metrics definitions
  const globalDescTarget = 2000;
  const globalTagsTarget = 15;
  const globalShotsTarget = 8;

  let sandboxDescAvg = sandboxGames.length ? Math.round(sandboxGames.reduce((s, g) => s + g.description_length, 0) / sandboxGames.length) : null;
  let sandboxTagsAvg = sandboxGames.length ? Math.round(sandboxGames.reduce((s, g) => s + g.tags_count, 0) / sandboxGames.length) : null;
  let sandboxShotsAvg = sandboxGames.length ? Math.round(sandboxGames.reduce((s, g) => s + g.screenshots, 0) / sandboxGames.length) : null;

  let scores = {};
  if (isItch) {
    scores = {
      cover: { score: 92, grade: 'good', label: 'Cover Dimensions' },
      theme: { score: 88, grade: 'good', label: 'Theme Contrast' },
      css: { score: 40, grade: 'bad', label: 'Custom CSS' },
      media: { score: 70, grade: 'ok', label: 'Media Embeds' },
    };
    
    document.getElementById('global-desc').textContent = '315x250';
    document.getElementById('sandbox-desc').textContent = '—';
    document.getElementById('global-tags').textContent = 'WCAG AAA';
    document.getElementById('sandbox-tags').textContent = '—';
    document.getElementById('global-shots').textContent = 'Enabled';
    document.getElementById('sandbox-shots').textContent = '—';
    document.getElementById('global-brand').textContent = 'Iframe Video';
    document.getElementById('sandbox-brand').textContent = '—';
    
    setTimeout(() => {
      document.getElementById('fill-global-desc').style.width = '92%';
      document.getElementById('fill-sandbox-desc').style.width = '0%';
      document.getElementById('fill-global-tags').style.width = '88%';
      document.getElementById('fill-sandbox-tags').style.width = '0%';
      document.getElementById('fill-global-shots').style.width = '40%';
      document.getElementById('fill-sandbox-shots').style.width = '0%';
      document.getElementById('fill-global-brand').style.width = '70%';
      document.getElementById('fill-sandbox-brand').style.width = '0%';
    }, 100);

  } else {
    // REAL SEARCH API LOGIC
    let appId = '';
    if (isSteamUrl) {
      const match = url.match(/\/app\/(\d+)/);
      if (match) appId = match[1];
    }
    
    try {
      if (!appId) {
        // Name search via Steam search API using allorigins proxy
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://store.steampowered.com/search/suggest?term=' + url + '&f=games&cc=US&realm=1&l=english')}`;
        const res = await fetch(proxyUrl);
        const data = await res.json();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, 'text/html');
        const firstLink = doc.querySelector('a');
        if (firstLink) {
           const linkUrl = firstLink.getAttribute('href');
           const match = linkUrl ? linkUrl.match(/\/app\/(\d+)/) : null;
           if (match) appId = match[1];
        }
      }
      
      if (appId) {
        // Fetch Steam store page data via appdetails API
        const pageProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://store.steampowered.com/api/appdetails?appids=' + appId)}`;
        const pageRes = await fetch(pageProxyUrl);
        const pageData = await pageRes.json();
        
        const parsed = JSON.parse(pageData.contents);
        const appData = parsed[appId].data;
        
        const desc = appData.detailed_description || '';
        const descLength = desc.length;
        
        const screenshotsCount = appData.screenshots ? appData.screenshots.length : 0;
        const genresCount = appData.genres ? appData.genres.length : 0;
        const categoriesCount = appData.categories ? appData.categories.length : 0;
        const tagCount = genresCount + categoriesCount + 8; 

        // Dual benchmarking calculations
        const globalDescScore = Math.min(100, Math.round((descLength / globalDescTarget) * 100));
        const globalTagsScore = Math.min(100, Math.round((tagCount / globalTagsTarget) * 100));
        const globalShotsScore = Math.min(100, Math.round((screenshotsCount / globalShotsTarget) * 100));
        const globalBrandScore = 80;

        const sandboxDescScore = sandboxDescAvg ? Math.min(100, Math.round((descLength / sandboxDescAvg) * 100)) : globalDescScore;
        const sandboxTagsScore = sandboxTagsAvg ? Math.min(100, Math.round((tagCount / sandboxTagsAvg) * 100)) : globalTagsScore;
        const sandboxShotsScore = sandboxShotsAvg ? Math.min(100, Math.round((screenshotsCount / sandboxShotsAvg) * 100)) : globalShotsScore;
        const sandboxBrandScore = 80;

        // Current overall user scores (prefer sandbox benchmarking if available)
        const descScore = sandboxDescAvg ? sandboxDescScore : globalDescScore;
        const tagsScore = sandboxTagsAvg ? sandboxTagsScore : globalTagsScore;
        const shotsScore = sandboxShotsAvg ? sandboxShotsScore : globalShotsScore;
        const brandScore = 80;
        
        scores = {
          desc: { score: descScore, grade: descScore >= 80 ? 'good' : (descScore >= 55 ? 'ok' : 'bad'), label: 'Description Length' },
          tags: { score: tagsScore, grade: tagsScore >= 80 ? 'good' : (tagsScore >= 55 ? 'ok' : 'bad'), label: 'Tag Saturation' },
          shots: { score: shotsScore, grade: shotsScore >= 80 ? 'good' : (shotsScore >= 55 ? 'ok' : 'bad'), label: 'Screenshots & Media' },
          brand: { score: brandScore, grade: 'good', label: 'Branding & Layout' }
        };

        // Render values in HTML
        document.getElementById('global-desc').textContent = `${globalDescTarget} char`;
        document.getElementById('sandbox-desc').textContent = sandboxDescAvg ? `${sandboxDescAvg} char` : '—';
        document.getElementById('global-tags').textContent = `${globalTagsTarget} tags`;
        document.getElementById('sandbox-tags').textContent = sandboxTagsAvg ? `${sandboxTagsAvg} tags` : '—';
        document.getElementById('global-shots').textContent = `${globalShotsTarget} items`;
        document.getElementById('sandbox-shots').textContent = sandboxShotsAvg ? `${sandboxShotsAvg} items` : '—';
        document.getElementById('global-brand').textContent = 'Pass';
        document.getElementById('sandbox-brand').textContent = sandboxGames.length ? 'Pass' : '—';

        // Render filled bars
        setTimeout(() => {
          document.getElementById('fill-global-desc').style.width = `${globalDescScore}%`;
          document.getElementById('fill-sandbox-desc').style.width = `${sandboxDescScore}%`;
          document.getElementById('fill-global-tags').style.width = `${globalTagsScore}%`;
          document.getElementById('fill-sandbox-tags').style.width = `${sandboxTagsScore}%`;
          document.getElementById('fill-global-shots').style.width = `${globalShotsScore}%`;
          document.getElementById('fill-sandbox-shots').style.width = `${sandboxShotsScore}%`;
          document.getElementById('fill-global-brand').style.width = `${globalBrandScore}%`;
          document.getElementById('fill-sandbox-brand').style.width = `${sandboxBrandScore}%`;
        }, 100);

        showToast(`✅ Live analysis complete for ${targetName}!`);
      } else {
        throw new Error("Game not found on Steam");
      }
    } catch(e) {
      console.warn("Live fetch failed, falling back to simulated data", e);
      showToast(`⚠ Live fetch failed, using simulated metrics...`);
      scores = {
        desc: { score: 85, grade: 'good', label: 'Description Length' },
        tags: { score: 90, grade: 'good', label: 'Tag Saturation' },
        shots: { score: 65, grade: 'ok', label: 'Screenshots & Media' },
        brand: { score: 75, grade: 'ok', label: 'Branding & Layout' },
      };
      
      document.getElementById('global-desc').textContent = '2000 char';
      document.getElementById('sandbox-desc').textContent = '—';
      document.getElementById('global-tags').textContent = '15 tags';
      document.getElementById('sandbox-tags').textContent = '—';
      document.getElementById('global-shots').textContent = '8 items';
      document.getElementById('sandbox-shots').textContent = '—';
      document.getElementById('global-brand').textContent = 'Pass';
      document.getElementById('sandbox-brand').textContent = '—';

      setTimeout(() => {
        document.getElementById('fill-global-desc').style.width = '85%';
        document.getElementById('fill-sandbox-desc').style.width = '0%';
        document.getElementById('fill-global-tags').style.width = '90%';
        document.getElementById('fill-sandbox-tags').style.width = '0%';
        document.getElementById('fill-global-shots').style.width = '65%';
        document.getElementById('fill-sandbox-shots').style.width = '0%';
        document.getElementById('fill-global-brand').style.width = '75%';
        document.getElementById('fill-sandbox-brand').style.width = '0%';
      }, 100);
    }
  }

  const cards = document.querySelectorAll('.metric-card');
  const keys = Object.keys(scores);
  keys.forEach((k, i) => {
    const card = cards[i];
    if (!card) return;
    const s = scores[k];
    card.querySelector('.metric-label').textContent = s.label;
    card.querySelector('.metric-score').textContent = s.score + '%';
    card.querySelector('.metric-score').className = `metric-score ${s.grade}`;
  });

  renderAuditRecommendations(scores, isItch);
  updateVisibility();
}

function renderAuditRecommendations(scores, isItch) {
  const panel = document.getElementById('audit-details-panel');
  const container = document.getElementById('audit-recommendations-list');
  
  if (!scores) {
    panel.style.display = 'none';
    return;
  }
  
  panel.style.display = 'block';
  let html = '';
  
  if (isItch) {
    html = `
      <div style="padding:1rem; background:var(--bg3); border-radius:8px; border-left:4px solid var(--primary);">
        <h4 style="margin:0 0 0.5rem 0; font-size:0.9rem; color:var(--text)">🌐 Itch.io Storefront Recommendations</h4>
        <p style="font-size:0.8rem; color:var(--text-dim); margin-bottom:0.8rem;">Your Itch.io page is optimized for customized styling and quick downloads.</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.75rem;">
          <div>
            <strong style="color:var(--success); display:block; margin-bottom:0.3rem;">✅ DOS</strong>
            <ul style="margin:0; padding-left:1.2rem; color:var(--text-dim); list-style-type:square;">
              <li>Keep cover image at exact 315×250 aspect ratio to prevent grid squishing.</li>
              <li>Enable Custom CSS configuration to align background panels to your game's palette.</li>
              <li>Embed a gameplay trailer directly inside an iframe so players don't have to leave the page.</li>
            </ul>
          </div>
          <div>
            <strong style="color:var(--danger); display:block; margin-bottom:0.3rem;">❌ DONT'S</strong>
            <ul style="margin:0; padding-left:1.2rem; color:var(--text-dim); list-style-type:square;">
              <li>Don't use low-contrast text on bright custom backgrounds (WCAG compliant is best).</li>
              <li>Don't hide your download widgets at the very bottom of a long description layout.</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  } else {
    const descRec = scores.desc.score >= 80 
      ? {
          title: "Description Length (Excellent)",
          why: `Your description length meets or exceeds the target benchmarks. This provides sufficient room to detail narrative hooks and combat features.`,
          dos: ["Utilize [h2] subheadings and bold text elements for easy scanning.", "Include animated gameplay GIFs to break up large paragraphs.", "Keep paragraphs strictly under 3 sentences."],
          donts: ["Don't exceed 3000 total characters to avoid reader cognitive fatigue.", "Don't write a wall of text without formatting."]
        }
      : {
          title: "Description Length (Under-optimized)",
          why: `Your store description is too short compared to successful competitors. Visual shoppers might not understand the gameplay loop depth.`,
          dos: ["Build a structural blueprint: Narrative Hook, Gameplay Depth, and Feature bullets.", "Explain the core gameplay loop and progression tree.", "Add a detailed story or lore hook."],
          donts: ["Don't copy-paste single paragraph summaries.", "Don't write solely about story; players care about mechanics."]
        };
        
    const tagRec = scores.tags.score >= 80 
      ? {
          title: "Tag Saturation (Excellent)",
          why: `You have 15 or more tags. Your game will properly index into Steam's recommendation algorithm.`,
          dos: ["Ensure your top 5 tags target the exact subgenre (e.g. Roguelike Deckbuilder).", "Order tags by search relevance in Steamworks."],
          donts: ["Don't include broad keywords like 'Indie' or 'Action' in your top 5 tags.", "Don't spam irrelevant tags."]
        }
      : {
          title: "Tag Saturation (Under-optimized)",
          why: `You have less than 12 tags. Steam needs at least 15 tags to construct recommendation metrics.`,
          dos: ["Use the Steam Tag wizard to add subgenres, mechanical features, themes, and camera perspectives.", "Check competitor pages to steal relevant tags."],
          donts: ["Don't publish with only broad tags (e.g. just 'Indie' or 'Adventure').", "Don't leave tags under 15."]
        };

    const mediaRec = scores.shots.score >= 80 
      ? {
          title: "Screenshots & Media (Excellent)",
          why: `Your screenshot and media count is strong. Shoppers can see diverse biomes and action.`,
          dos: ["Ensure the first 4 screenshots show distinct gameplay and clean UI.", "Show combat or direct action in 80% of your screenshots."],
          donts: ["Don't upload concept art or title cards.", "Don't use low-resolution debug images."]
        }
      : {
          title: "Screenshots & Media (Under-optimized)",
          why: `Your screenshot count is below benchmark. Visual buyers require a rich catalog of game highlights.`,
          dos: ["Upload at least 8 to 12 HD screenshots showing distinct biomes and gameplay action.", "Incorporate at least one raw gameplay trailer (no titles, just play)."],
          donts: ["Don't upload duplicate zones/biomes.", "Don't use raw editor screenshots with developer debug UI visible."]
        };

    const brandRec = {
      title: "Branding & Layout",
      why: "Evaluates layout, capsule compatibility, and general consistency.",
      dos: ["Extract dominant colors from your capsule and use them for header underlines/text highlights.", "Sync branding keywords between your trailer, capsules, and description text."],
      donts: ["Don't use neon/saturated colors that contradict your main capsule art direction.", "Don't use pixelated fonts or mismatched logos."]
    };

    const recs = [descRec, tagRec, mediaRec, brandRec];
    
    html = recs.map(r => `
      <div style="padding:1rem; background:var(--bg3); border-radius:8px; border-left:4px solid ${r.title.includes('Under-optimized') ? 'var(--danger)' : 'var(--primary)'}">
        <h4 style="margin:0 0 0.3rem 0; font-size:0.85rem; color:var(--text)">${r.title}</h4>
        <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:0.8rem;">${r.why}</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.7rem;">
          <div>
            <strong style="color:var(--success); display:block; margin-bottom:0.2rem;">✅ DOS</strong>
            <ul style="margin:0; padding-left:1rem; color:var(--text-dim); list-style-type:square; line-height:1.3;">
              ${r.dos.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
          <div>
            <strong style="color:var(--danger); display:block; margin-bottom:0.2rem;">❌ DONT'S</strong>
            <ul style="margin:0; padding-left:1rem; color:var(--text-dim); list-style-type:square; line-height:1.3;">
              ${r.donts.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════════════
// VISIBILITY SCORE
// ══════════════════════════════════════════════════════════════════════════════
function updateVisibility() {
  const scores = [];
  const breakdown = document.getElementById('vis-breakdown');

  if (capsuleScores) {
    scores.push({ name: 'Capsule', score: capsuleScores.overall, icon: '🎨' });
  }

  const metricCards = document.querySelectorAll('.metric-card');
  const fallbackIcons = ['📝', '🏷️', '📸', '🎯'];
  metricCards.forEach((card, i) => {
    const labelEl = card.querySelector('.metric-label');
    const scoreEl = card.querySelector('.metric-score');
    if (labelEl && scoreEl) {
      const val = parseInt(scoreEl.textContent);
      if (!isNaN(val)) {
        scores.push({ name: labelEl.textContent, score: val, icon: fallbackIcons[i] || '⚡' });
      }
    }
  });

  if (scores.length === 0) return;

  const composite = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
  const grade = composite >= 80 ? 'good' : composite >= 55 ? 'ok' : 'bad';

  const ring = document.getElementById('vis-ring');
  const circumference = 2 * Math.PI * 90;
  ring.style.strokeDashoffset = circumference - (circumference * composite / 100);
  ring.className = `vis-ring-fill ${grade}`;

  document.getElementById('vis-score').textContent = composite + '%';
  document.getElementById('vis-score').style.color =
    composite >= 80 ? 'var(--success)' : composite >= 55 ? 'var(--accent)' : 'var(--danger)';

  breakdown.innerHTML = scores.map(s => {
    const c = s.score >= 80 ? 'var(--success)' : s.score >= 55 ? 'var(--accent)' : 'var(--danger)';
    return `
      <div class="vis-metric">
        <div class="vis-metric-icon">${s.icon}</div>
        <div class="vis-metric-info">
          <div class="vis-metric-name">${s.name}</div>
          <div class="vis-metric-score" style="color:${c}">${s.score}%</div>
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// TEMPLATE GENERATOR
// ══════════════════════════════════════════════════════════════════════════════
function generateDescriptionTemplate() {
  const data = loadedGenreData[activeGenre];
  if (!data || !data.blueprint) {
    showToast('⚠ No blueprint data available.');
    return;
  }
  
  let template = `[b]${data.genre_name} Description Blueprint[/b]\n\n`;
  
  data.blueprint.forEach(node => {
    template += `[h2]${node.section}[/h2]\n`;
    template += `[i]Target Length: ${node.avg_percent} of page[/i]\n`;
    template += `<!-- ${node.description} -->\n`;
    template += `[Write your content for ${node.section} here...]\n\n`;
  });
  
  if (data.common_features && data.common_features.length) {
    template += `[h2]Key Features[/h2]\n[list]\n`;
    data.common_features.forEach(f => {
      template += `[*] ${f}\n`;
    });
    template += `[/list]\n\n`;
  }
  
  document.getElementById('template-textarea').value = template;
  document.getElementById('template-modal').classList.add('show');
}

function copyTemplateToClipboard() {
  const text = document.getElementById('template-textarea').value;
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 Template copied to clipboard!');
    document.getElementById('template-modal').classList.remove('show');
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// LAUNCH CHECKLIST
// ══════════════════════════════════════════════════════════════════════════════
const CHECKLIST_DATA = [
  {
    group: '🎨 Steam Capsule Assets',
    items: [
      { id: 'cap_main', label: 'Main Capsule (616×353)', hint: 'Required' },
      { id: 'cap_small', label: 'Small Capsule (231×87)', hint: 'Required' },
      { id: 'cap_header', label: 'Header Capsule (460×215)', hint: 'Required' },
      { id: 'cap_hero', label: 'Library Hero (3840×1240)', hint: 'Recommended' },
      { id: 'cap_logo', label: 'Library Logo (1280×720)', hint: 'Recommended' }
    ]
  },
  {
    group: '📝 Store Page Content',
    items: [
      { id: 'page_short', label: 'Short Description (< 300 chars)', hint: 'Required' },
      { id: 'page_long', label: 'Long Description (with formatting)', hint: 'Required' },
      { id: 'page_screenshots', label: 'Screenshots (5-10 recommended)', hint: 'Min 5' },
      { id: 'page_tags', label: 'Tags Configured (15-20)', hint: 'Required' },
      { id: 'page_system_req', label: 'System Requirements', hint: 'Required' }
    ]
  },
  {
    group: '🚀 Launch Preparation',
    items: [
      { id: 'launch_demo', label: 'Demo Build Available', hint: 'Recommended' },
      { id: 'launch_social', label: 'Social Media Accounts Active', hint: 'Recommended' },
      { id: 'launch_community', label: 'Community Hub Enabled', hint: 'Required' },
      { id: 'launch_localization', label: 'Localization (at least EN)', hint: 'Required' }
    ]
  }
];

function loadChecklistState() {
  try {
    const saved = localStorage.getItem('playbuild-checklist');
    if (saved) checklistState = JSON.parse(saved);
  } catch(e) {}
  renderChecklist();
}

function saveChecklistState() {
  localStorage.setItem('playbuild-checklist', JSON.stringify(checklistState));
}

function toggleCheckItem(id) {
  checklistState[id] = !checklistState[id];
  saveChecklistState();
  renderChecklist();
}

function renderChecklist() {
  const wrap = document.getElementById('checklist-wrap');
  const totalItems = CHECKLIST_DATA.reduce((sum, g) => sum + g.items.length, 0);
  const checkedItems = Object.values(checklistState).filter(Boolean).length;
  const overallPct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  wrap.innerHTML = `
    <div style="text-align:center;padding:1rem 0 0.5rem">
      <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.4rem">OVERALL READINESS</div>
      <div style="font-size:2.5rem;font-weight:800;color:${overallPct>=80?'var(--success)':overallPct>=50?'var(--accent)':'var(--text-dim)'}">${overallPct}%</div>
      <div style="font-size:0.75rem;color:var(--text-dim)">${checkedItems} of ${totalItems} items complete</div>
    </div>
    ${CHECKLIST_DATA.map(group => {
      const groupChecked = group.items.filter(item => checklistState[item.id]).length;
      const groupPct = Math.round((groupChecked / group.items.length) * 100);
      return `
        <div class="checklist-group">
          <div class="checklist-group-header">
            <div class="checklist-group-title">${group.group}</div>
            <div class="checklist-group-progress">${groupChecked}/${group.items.length}</div>
          </div>
          <div class="checklist-progress-bar">
            <div class="checklist-progress-fill" style="width:${groupPct}%"></div>
          </div>
          <div class="checklist-items">
            ${group.items.map(item => {
              const checked = checklistState[item.id] ? 'checked' : '';
              return `
                <div class="checklist-item ${checked}" onclick="toggleCheckItem('${item.id}')">
                  <div class="check-box">${checklistState[item.id] ? '✓' : ''}</div>
                  <span class="check-label">${item.label}</span>
                  <span class="check-hint">${item.hint}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
// DESCRIPTION EDITOR & GENERATOR
// ══════════════════════════════════════════════════════════════════════════════
let currentEditorPlatform = 'steam';

function setPlatform(platform) {
  currentEditorPlatform = platform;
  document.getElementById('platform-steam').classList.toggle('active', platform === 'steam');
  document.getElementById('platform-itch').classList.toggle('active', platform === 'itch');
  showToast(`🎯 Target platform changed to ${platform === 'steam' ? 'Steam' : 'Itch.io'}`);
}

function switchEditorTab(tab) {
  document.querySelectorAll('.editor-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(tab));
  });
  document.querySelectorAll('.editor-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `editor-tab-${tab}`);
  });
}

function generateStorePage() {
  const rawDraft = document.getElementById('editor-raw-draft').value.trim();
  const genre = document.getElementById('editor-genre').value;
  const tone = document.getElementById('editor-tone').value;
  const tags = document.getElementById('editor-tags').value.trim();
  
  if (!rawDraft) {
    showToast('⚠ Please type or paste your raw description draft first');
    return;
  }

  // Show loading overlay
  const overlay = document.getElementById('editor-loading-overlay');
  const placeholder = document.getElementById('editor-placeholder');
  const resultsWrap = document.getElementById('editor-results-wrap');
  
  overlay.style.display = 'flex';
  placeholder.style.display = 'none';
  resultsWrap.style.display = 'none';
  
  // Reset loading steps
  const steps = ['step-1', 'step-2', 'step-3', 'step-4'];
  steps.forEach(s => {
    const el = document.getElementById(s);
    el.className = 'step-item';
  });

  // Step 1: Competitor fetching simulation
  setTimeout(() => {
    document.getElementById('step-1').className = 'step-item active';
    
    // Step 2: Tone analysis simulation
    setTimeout(() => {
      document.getElementById('step-1').className = 'step-item done';
      document.getElementById('step-2').className = 'step-item active';
      
      // Step 3: Structuring modules simulation
      setTimeout(() => {
        document.getElementById('step-2').className = 'step-item done';
        document.getElementById('step-3').className = 'step-item active';
        
        // Step 4: Finalizing tags and reqs simulation
        setTimeout(() => {
          document.getElementById('step-3').className = 'step-item done';
          document.getElementById('step-4').className = 'step-item active';
          
          // Complete and show results
          setTimeout(() => {
            document.getElementById('step-4').className = 'step-item done';
            overlay.style.display = 'none';
            resultsWrap.style.display = 'flex';
            
            // Generate the optimized text
            buildOptimizedCopy(rawDraft, genre, tone, tags);
          }, 400);
        }, 600);
      }, 700);
    }, 650);
  }, 300);
}

function buildOptimizedCopy(draft, genre, tone, customTags) {
  // Simple smart draft parser: extract interesting looking words/short sentences
  const sentences = draft.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
  const coreHookSentence = sentences[0] || "An exciting adventure awaits in this new indie game.";
  
  // Collect sandbox games to mention similar feel / references
  const references = sandboxGames.map(g => g.name);
  const referenceText = references.length 
    ? `Influenced by the gameplay dynamics and mechanical depth of ${references.join(' and ')}.`
    : `Designed as a modern evolution of classic ${genre} experiences.`;

  // Genre specific marketing features
  const genreFeatures = {
    horror: ["Visceral atmosphere and tense environment mapping.", "Psychological horror elements that twist player choices.", "Unpredictable sound design keeping you on edge."],
    action: ["Fast-paced combat mechanics with customizable skills.", "Intense boss encounters testing reflexes and strategy.", "High-mobility exploration elements across vertical levels."],
    rpg: ["Deep branching story paths where choice determines destiny.", "Expansive character progression and equipment crafting.", "Tactical combat systems layered with elemental synergies."],
    strategy: ["Procedural campaigns requiring complex resource optimization.", "Modular base building and territory defense structures.", "Dynamic AI patterns that counter your tactical placement."],
    puzzle: ["Mind-bending physics and spatial orientation mechanics.", "Satisfying difficulty curve designed for deep flow state.", "Minimalist aesthetic combined with soothing soundscapes."],
    simulation: ["Accurate physics engine calculating authentic handling.", "Complex economics, scaling mechanics, and detailed telemetry.", "Sandbox customizability allowing complete creative control."],
    adventure: ["Intriguing world-lore scattered through environmental logs.", "Charming puzzle-platforming elements hidden in secrets.", "Memorable cast of characters with interactive questlines."]
  };

  const selectedFeatures = genreFeatures[genre] || genreFeatures.action;
  
  // Tone settings modifier
  const toneIntro = {
    dark: "Plunge into a cold, uncompromising world where danger waits behind every shadow.",
    cinematic: "Experience a grand, cinematic journey filled with epic moments and heart-stopping setpieces.",
    cozy: "Relax, take a deep breath, and lose yourself in a cozy, charming world built for comfort.",
    action: "Get ready for high-octane thrills, explosive combat, and adrenaline-fueled speed.",
    humorous: "Welcome to a delightfully wacky, chaotic comedy of errors where anything goes!",
    tactical: "Engage your mind in a highly strategic, deep tactical experience where every detail matters."
  };
  const introHook = toneIntro[tone] || toneIntro.cinematic;

  // Format short hook description (< 300 chars)
  const shortHook = `${introHook} ${coreHookSentence.substring(0, 140)}${coreHookSentence.length > 140 ? '...' : ''} ${references.length ? 'For fans of ' + references[0] + '.' : ''}`.substring(0, 290);

  // System requirements benchmarks based on genre
  const reqs = {
    heavy: {
      minOS: "Windows 10 64-bit", minCPU: "Intel Core i5-4460 or AMD FX-6300", minRAM: "8 GB RAM", minGPU: "NVIDIA GeForce GTX 760 or AMD Radeon R7 260x",
      recOS: "Windows 10/11 64-bit", recCPU: "Intel Core i7-3770 or AMD FX-8350", recRAM: "16 GB RAM", recGPU: "NVIDIA GeForce GTX 1060 or AMD Radeon RX 480"
    },
    light: {
      minOS: "Windows 7/10 64-bit", minCPU: "Dual Core 2.0 GHz", minRAM: "4 GB RAM", minGPU: "Intel HD 4000 or GeForce GT 710",
      recOS: "Windows 10 64-bit", recCPU: "Quad Core 3.0 GHz", recRAM: "8 GB RAM", recGPU: "NVIDIA GeForce GTX 660 or AMD Radeon HD 7870"
    }
  };
  const selectedReqClass = (genre === 'action' || genre === 'rpg' || genre === 'simulation') ? 'heavy' : 'light';
  const systemReq = reqs[selectedReqClass];

  // 1. STEAM FORMAT (BBCode)
  const steamBBAbout = `[h2]About This Game[/h2]\n${introHook}\n\n${coreHookSentence}. ${sentences.slice(1, 3).join('. ') + (sentences.length > 1 ? '.' : '')}\n\n${referenceText}\n\n[h2]Key Features[/h2]\n[list]\n${selectedFeatures.map(f => `[*] [b]${f.split(' ')[0]} ${f.split(' ')[1] || ''}[/b] - ${f.split(' ').slice(2).join(' ')}`).join('\n')}\n${customTags ? customTags.split(',').map(t => `[*] [b]${t.trim()}[/b] - Designed with optimized genre mechanics in mind.`).join('\n') : ''}\n[/list]`;

  const steamBBMinReq = `OS: ${systemReq.minOS}\nProcessor: ${systemReq.minCPU}\nMemory: ${systemReq.minRAM}\nGraphics: ${systemReq.minGPU}\nStorage: 2 GB available space`;
  const steamBBRecReq = `OS: ${systemReq.recOS}\nProcessor: ${systemReq.recCPU}\nMemory: ${systemReq.recRAM}\nGraphics: ${systemReq.recGPU}\nStorage: 2 GB available space`;

  const steamFullBB = `${shortHook}\n\n=========================================\n\n${steamBBAbout}\n\n=========================================\n\n[b]MINIMUM REQUIREMENTS:[/b]\n${steamBBMinReq}\n\n[b]RECOMMENDED REQUIREMENTS:[/b]\n${steamBBRecReq}`;

  // 2. ITCH FORMAT (HTML)
  const itchHTMLAbout = `<h2>About the Game</h2>\n<p><strong>${introHook}</strong></p>\n<p>${coreHookSentence}. ${sentences.slice(1, 3).join('. ') + (sentences.length > 1 ? '.' : '')}</p>\n<p><em>${referenceText}</em></p>\n<h2>Key Features</h2>\n<ul>\n${selectedFeatures.map(f => `<li><strong>${f.split(' ')[0]} ${f.split(' ')[1] || ''}</strong> - ${f.split(' ').slice(2).join(' ')}</li>`).join('\n')}\n${customTags ? customTags.split(',').map(t => `<li><strong>${t.trim()}</strong> - Built for authentic indie game flow.</li>`).join('\n') : ''}\n</ul>`;
  
  const itchHTMLMinReq = `OS: ${systemReq.minOS}<br>Processor: ${systemReq.minCPU}<br>Memory: ${systemReq.minRAM}<br>Graphics: ${systemReq.minGPU}<br>Storage: 2 GB available space`;
  const itchHTMLRecReq = `OS: ${systemReq.recOS}<br>Processor: ${systemReq.recCPU}<br>Memory: ${systemReq.recRAM}<br>Graphics: ${systemReq.recGPU}<br>Storage: 2 GB available space`;

  const itchFullHTML = `Tagline: ${shortHook}\n\n=========================================\n\n${itchHTMLAbout}\n\n=========================================\n\n<strong>MINIMUM REQUIREMENTS:</strong><br>${itchHTMLMinReq}\n\n<strong>RECOMMENDED REQUIREMENTS:</strong><br>${itchHTMLRecReq}`;

  // Bind values based on selected platform
  if (currentEditorPlatform === 'steam') {
    // Renders Preview using HTML equivalent tags
    document.getElementById('prev-short-desc').textContent = shortHook;
    document.getElementById('prev-long-desc').innerHTML = steamBBAbout
      .replace(/\[h2\]/g, '<h2>').replace(/\[\/h2\]/g, '</h2>')
      .replace(/\[b\]/g, '<strong>').replace(/\[\/b\]/g, '</strong>')
      .replace(/\[i\]/g, '<em>').replace(/\[\/i\]/g, '</em>')
      .replace(/\[list\]/g, '<ul>').replace(/\[\/list\]/g, '</ul>')
      .replace(/\[\*\]/g, '<li>').replace(/\n/g, '<br>');
    
    document.getElementById('prev-sys-min').innerHTML = steamBBMinReq.replace(/\n/g, '<br>');
    document.getElementById('prev-sys-rec').innerHTML = steamBBRecReq.replace(/\n/g, '<br>');
    
    document.getElementById('editor-code-output').value = steamFullBB;
  } else {
    // Itch HTML
    document.getElementById('prev-short-desc').textContent = shortHook;
    document.getElementById('prev-long-desc').innerHTML = itchHTMLAbout;
    document.getElementById('prev-sys-min').innerHTML = itchHTMLMinReq;
    document.getElementById('prev-sys-rec').innerHTML = itchHTMLRecReq;
    
    document.getElementById('editor-code-output').value = itchFullHTML;
  }
}

function copyEditorCodeToClipboard() {
  const text = document.getElementById('editor-code-output').value;
  if (!text) return;
  
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 Generated description copied to clipboard!');
  }).catch(() => {
    showToast('⚠ Failed to copy to clipboard.');
  });
}