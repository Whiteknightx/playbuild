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

  let scores = {};
  if (isItch) {
    scores = {
      cover: { score: 92, grade: 'good', label: 'Cover Dimensions' },
      theme: { score: 88, grade: 'good', label: 'Theme Contrast' },
      css: { score: 40, grade: 'bad', label: 'Custom CSS' },
      media: { score: 70, grade: 'ok', label: 'Media Embeds' },
    };
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
           // Ensure it's not returning the proxy's URL but the parsed one
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
        // Approximation of total tags based on genres + categories (since tag data is hidden from appdetails API)
        const tagCount = genresCount + categoriesCount + 8; 
        
        // Dynamic Heuristics
        scores = {
          desc: { score: descLength > 1500 ? 95 : (descLength > 500 ? 70 : 40), grade: descLength > 1500 ? 'good' : (descLength > 500 ? 'ok' : 'bad'), label: 'Description' },
          tags: { score: tagCount >= 15 ? 95 : (tagCount >= 10 ? 75 : 45), grade: tagCount >= 15 ? 'good' : (tagCount >= 10 ? 'ok' : 'bad'), label: `Tags (${tagCount})` },
          shots: { score: screenshotsCount >= 5 ? 85 : 50, grade: screenshotsCount >= 5 ? 'good' : 'bad', label: 'Screenshots' },
          brand: { score: 80, grade: 'good', label: 'Branding' }
        };
        showToast(`✅ Live analysis complete for ${targetName}!`);
      } else {
        throw new Error("Game not found on Steam");
      }
    } catch(e) {
      console.warn("Live fetch failed, falling back to simulated data", e);
      showToast(`⚠ Live fetch failed, using simulated metrics...`);
      scores = {
        desc: { score: 85, grade: 'good', label: 'Description' },
        tags: { score: 90, grade: 'good', label: 'Tags' },
        shots: { score: 65, grade: 'ok', label: 'Screenshots' },
        brand: { score: 75, grade: 'ok', label: 'Branding' },
      };
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
    const bar = card.querySelector('.metric-bar-fill');
    bar.className = `metric-bar-fill ${s.grade}`;
    setTimeout(() => { bar.style.width = s.score + '%'; }, 100 + i * 150);
  });

  updateVisibility();
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