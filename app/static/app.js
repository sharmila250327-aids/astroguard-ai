// ==============================================================
// ASTROGUARD AI — WEATHER & DISASTER RISK INTELLIGENCE PLATFORM
// CLIENT CONTROLLER & TELEMETRY ENGINE
// ==============================================================

const $ = id => document.getElementById(id);

// Default location: Viluppuram, Tamil Nadu, India
let selected = {
  name: "Viluppuram, Tamil Nadu, India",
  lat: 11.9401,
  lon: 79.4861,
  district: "Viluppuram"
};

let currentUser = null;
let token = localStorage.getItem("ag_token");
let map = null;
let mapMarkersLayer = null;
let currentMapFilter = "all";
let periodDailyChart = null;
let monthlyComparisonChart = null;
let currentPeriod = "last_7_days";

// WMO Weather interpretation table for conditions and icons
function decodeWeatherCode(code) {
  if (code === 0) return { label: "Clear Sky", icon: "sun", class: "clear" };
  if ([1, 2].includes(code)) return { label: "Partly Cloudy", icon: "cloud-sun", class: "cloudy" };
  if (code === 3) return { label: "Overcast", icon: "cloud", class: "cloudy" };
  if ([45, 48].includes(code)) return { label: "Foggy", icon: "cloud-fog", class: "fog" };
  if ([51, 53, 55].includes(code)) return { label: "Drizzle", icon: "cloud-drizzle", class: "rain" };
  if ([61, 63].includes(code)) return { label: "Light Rain", icon: "cloud-rain", class: "rain" };
  if (code === 65) return { label: "Heavy Rain", icon: "cloud-rain", class: "heavy-rain" };
  if ([80, 81, 82].includes(code)) return { label: "Rain Showers", icon: "cloud-rain", class: "rain" };
  if ([95, 96, 99].includes(code)) return { label: "Thunderstorm", icon: "cloud-lightning", class: "storm" };
  return { label: "Scattered Clouds", icon: "cloud", class: "cloudy" };
}

// Toast notification helper
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3200);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

const API_BASE = (window.location.protocol === "file:" || !window.location.port) ? "http://127.0.0.1:8000" : "";

// Universal API wrapper
async function api(path, opts = {}) {
  const fullPath = path.startsWith("http") ? path : (API_BASE + path);
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(fullPath, { ...opts, headers });
  let data = {};
  try { data = await res.json(); } catch { }
  if (!res.ok) throw new Error(data.detail || data.message || `Request failed (${res.status}).`);
  return data;
}

// Live Clock Ticker
function startClock() {
  setInterval(() => {
    const now = new Date();
    const utcStr = now.toUTCString().slice(17, 25) + " UTC";
    if ($("navClock")) $("navClock").textContent = utcStr;
  }, 1000);
}

// ==============================================================
// 1. AUTHENTICATION & ROLE-BASED DASHBOARD ROUTING
// ==============================================================
async function initSession() {
  startClock();
  if (window.lucide) lucide.createIcons();

  if (!token) {
    showAuthView();
    return;
  }

  try {
    const data = await api("/api/me");
    currentUser = data.user;
    showAppShell();
  } catch (err) {
    token = null;
    localStorage.removeItem("ag_token");
    showAuthView();
  }
}

function showAuthView() {
  $("authView").classList.remove("hidden");
  $("appShell").classList.add("hidden");
  if (window.lucide) lucide.createIcons();
}

function returnToDashboard() {
  if (currentUser) {
    showAppShell();
  } else {
    handleGuestLogin("public");
  }
}

function toggleSidebar() {
  const sb = $("mainSidebar");
  const bd = $("sidebarBackdrop");
  if (!sb) return;
  sb.classList.toggle("open");
  if (bd) bd.classList.toggle("active");
}

function showAppShell() {
  $("authView").classList.add("hidden");
  $("appShell").classList.remove("hidden");

  // Update nav profile
  $("navUserName").textContent = currentUser.name;
  $("navUserRole").textContent = currentUser.role.toUpperCase() + (currentUser.is_verified ? " (VERIFIED)" : "");
  $("navAvatar").textContent = currentUser.name.charAt(0).toUpperCase();

  // Update sidebar role indicator
  if ($("sidebarRoleName")) {
    $("sidebarRoleName").textContent = currentUser.role === "public" ? "Citizen Community" : (currentUser.role === "rescue" ? "Rescue First Responder" : "District DEOC Admin");
  }

  renderSidebarNav(currentUser.role);
  activateRoleDashboard(currentUser.role);

  // Initialize map and load Viluppuram default data
  setTimeout(() => {
    initLeafletMap();
    loadDashboardData();
    loadNotifications();
  }, 100);

  if (window.lucide) lucide.createIcons();
}

async function handleLoginSubmit(e, role) {
  e.preventDefault();
  const email = $(`email-${role}`).value.trim();
  const pass = $(`pass-${role}`).value.trim();

  try {
    const res = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass })
    });
    token = res.token;
    localStorage.setItem("ag_token", token);
    currentUser = res.user;
    toast(`Welcome back, ${res.user.name}`);
    showAppShell();
  } catch (err) {
    toast("Login Failed: " + err.message);
  }
}

async function handleGuestLogin(role) {
  try {
    const res = await api(`/api/auth/guest/${role}`, { method: "POST" });
    token = res.token;
    localStorage.setItem("ag_token", token);
    currentUser = res.user;
    toast(`Authenticated as ${res.user.name} (${role.toUpperCase()})`);
    showAppShell();
  } catch (err) {
    toast("Demo Login Failed: " + err.message);
  }
}

function performLogout() {
  token = null;
  currentUser = null;
  localStorage.removeItem("ag_token");
  toast("Signed out successfully.");
  showAuthView();
}

// Citizen Registration
function openRegisterModal() {
  $("registerModal").classList.remove("hidden");
}
function closeRegisterModal() {
  $("registerModal").classList.add("hidden");
}
async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = $("regName").value.trim();
  const email = $("regEmail").value.trim();
  const pass = $("regPassword").value.trim();

  try {
    const res = await api("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: pass })
    });
    token = res.token;
    localStorage.setItem("ag_token", token);
    currentUser = res.user;
    closeRegisterModal();
    toast(`Account created! Welcome, ${res.user.name}`);
    showAppShell();
  } catch (err) {
    toast("Registration Error: " + err.message);
  }
}

// Role-based sidebar renderer
function renderSidebarNav(role) {
  const menu = $("sidebarMenu");
  if (!menu) return;

  if (role === "public") {
    menu.innerHTML = `
      <button class="sb-link active" onclick="switchPublicSection('section-overview', this)"><i data-lucide="layout-grid"></i> Overview</button>
      <button class="sb-link" onclick="switchPublicSection('weatherMainCard', this)"><i data-lucide="sun"></i> Weather</button>
      <button class="sb-link" onclick="switchPublicSection('hourlyStrip', this)"><i data-lucide="cloud-rain"></i> Rainfall Forecast</button>
      <button class="sb-link" onclick="switchPublicSection('section-history', this)"><i data-lucide="calendar"></i> Historical Data</button>
      <button class="sb-link" onclick="switchPublicSection('section-landslides', this)"><i data-lucide="mountain"></i> Landslide History</button>
      <button class="sb-link" onclick="switchPublicSection('section-floods', this)"><i data-lucide="waves"></i> Flood History</button>
      <button class="sb-link" onclick="switchPublicSection('section-risk', this)"><i data-lucide="shield-alert"></i> Risk Analysis</button>
      <button class="sb-link" onclick="switchPublicSection('section-map', this)"><i data-lucide="map"></i> Map</button>
      <button class="sb-link" onclick="switchPublicSection('section-safer', this)"><i data-lucide="compass"></i> Safer Areas</button>
      <button class="sb-link" onclick="switchPublicSection('section-family', this)"><i data-lucide="users"></i> Family Contacts</button>
      <button class="sb-link" onclick="switchPublicSection('globalAlertBanner', this)"><i data-lucide="bell"></i> Notifications</button>
      <button class="sb-link" onclick="openReportModal()"><i data-lucide="file-plus"></i> My Reports</button>
      <button class="sb-link" onclick="switchPublicSection('section-reviews', this)"><i data-lucide="star"></i> My Reviews</button>
      <div style="height:1px;background:rgba(255,255,255,0.06);margin:8px 0;"></div>
      <button class="sb-link" onclick="showAuthView()"><i data-lucide="users-round"></i> Switch Role</button>
      <button class="sb-link" onclick="performLogout()"><i data-lucide="log-out"></i> Logout</button>
    `;
  } else if (role === "rescue") {
    menu.innerHTML = `
      <button class="sb-link active" onclick="scrollToRoleSection('rescueHero', this)"><i data-lucide="layout-dashboard"></i> Rescue Command</button>
      <button class="sb-link" onclick="scrollToRoleSection('rescueTriageSection', this)"><i data-lucide="alert-octagon"></i> Triage Queue</button>
      <button class="sb-link" onclick="scrollToRoleSection('rescueMapSection', this)"><i data-lucide="map"></i> Tactical GIS Map</button>
      <button class="sb-link" onclick="scrollToRoleSection('rescueUnitsSection', this)"><i data-lucide="shield"></i> Active Battalions</button>
      <button class="sb-link" onclick="openReportModal()"><i data-lucide="plus-circle"></i> Log Field SOS</button>
      <button class="sb-link" onclick="loadRescueViewData()"><i data-lucide="refresh-cw"></i> Refresh Status</button>
      <div style="height:1px;background:rgba(255,255,255,0.06);margin:8px 0;"></div>
      <button class="sb-link" onclick="previewPublicPortal()"><i data-lucide="eye"></i> View Public Radar</button>
      <button class="sb-link" onclick="showAuthView()"><i data-lucide="users-round"></i> Switch Role</button>
      <button class="sb-link" onclick="performLogout()"><i data-lucide="log-out"></i> Logout</button>
    `;
  } else if (role === "collector") {
    menu.innerHTML = `
      <button class="sb-link active" onclick="scrollToRoleSection('collectorHero', this)"><i data-lucide="landmark"></i> DEOC Overview</button>
      <button class="sb-link" onclick="scrollToRoleSection('collectorShelterSection', this)"><i data-lucide="home"></i> Shelter Logistics</button>
      <button class="sb-link" onclick="scrollToRoleSection('collectorBroadcastSection', this)"><i data-lucide="radio"></i> Issue Directives</button>
      <button class="sb-link" onclick="scrollToRoleSection('collectorActiveDirectives', this)"><i data-lucide="bell"></i> Active Alerts</button>
      <button class="sb-link" onclick="scrollToRoleSection('collectorContactsSection', this)"><i data-lucide="phone"></i> Official Contacts</button>
      <button class="sb-link" onclick="scrollToRoleSection('collectorCsvSection', this)"><i data-lucide="upload"></i> CSV Integration</button>
      <button class="sb-link" onclick="exportIncidentReports()"><i data-lucide="download"></i> Export Reports CSV</button>
      <div style="height:1px;background:rgba(255,255,255,0.06);margin:8px 0;"></div>
      <button class="sb-link" onclick="previewPublicPortal()"><i data-lucide="eye"></i> View Public Radar</button>
      <button class="sb-link" onclick="showAuthView()"><i data-lucide="users-round"></i> Switch Role</button>
      <button class="sb-link" onclick="performLogout()"><i data-lucide="log-out"></i> Logout</button>
    `;
  }

  if (window.lucide) lucide.createIcons();
}

function activateRoleDashboard(role) {
  document.querySelectorAll(".workspace-view").forEach(v => v.classList.remove("active"));
  const targetView = $(`view-${role}`);
  if (targetView) targetView.classList.add("active");

  const previewBanner = $("rolePreviewBanner");
  if (previewBanner && role !== "public") {
    previewBanner.classList.add("hidden");
  }

  if (role === "rescue") {
    loadRescueViewData();
  } else if (role === "collector") {
    loadCollectorViewData();
    loadCollectorSheltersTable();
  }
}

function scrollToRoleSection(targetId, btnEl) {
  if (currentUser && currentUser.role === "rescue") {
    activateRoleDashboard("rescue");
  } else if (currentUser && currentUser.role === "collector") {
    activateRoleDashboard("collector");
  }
  const el = $(targetId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (btnEl) {
    document.querySelectorAll(".sb-link").forEach(b => b.classList.remove("active"));
    btnEl.classList.add("active");
  }
  const sb = $("mainSidebar");
  const bd = $("sidebarBackdrop");
  if (sb && sb.classList.contains("open")) {
    sb.classList.remove("open");
    if (bd) bd.classList.remove("active");
  }
}

function previewPublicPortal() {
  activateRoleDashboard("public");
  const banner = $("rolePreviewBanner");
  if (banner && currentUser) {
    banner.classList.remove("hidden");
    const roleLabel = currentUser.role === "rescue" ? "Rescue First Responder" : "District DEOC Collector";
    if ($("previewRoleName")) $("previewRoleName").textContent = `${currentUser.name} (${roleLabel})`;
  }
  toast(`Viewing Public Citizen portal. Click 'Return to Command Hub' to return.`);
}

function returnToActiveRoleDashboard() {
  const banner = $("rolePreviewBanner");
  if (banner) banner.classList.add("hidden");
  if (currentUser) {
    activateRoleDashboard(currentUser.role);
    renderSidebarNav(currentUser.role);
    toast(`Returned to ${currentUser.role.toUpperCase()} Command Grid.`);
  }
}

function switchPublicSection(targetId, btnEl) {
  if (currentUser.role !== "public") {
    activateRoleDashboard("public");
  }
  const el = $(targetId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (btnEl) {
    document.querySelectorAll(".sb-link").forEach(b => b.classList.remove("active"));
    btnEl.classList.add("active");
  }
  // Auto-close mobile drawer if open
  const sb = $("mainSidebar");
  const bd = $("sidebarBackdrop");
  if (sb && sb.classList.contains("open")) {
    sb.classList.remove("open");
    if (bd) bd.classList.remove("active");
  }
}

// ==============================================================
// 2. LOCATION SEARCH & AUTO-DETECTION
// ==============================================================
async function triggerSearch() {
  const q = $("topSearchInput").value.trim();
  if (q.length < 2) return toast("Enter at least 2 characters to search.");
  const box = $("topSearchResults");
  box.innerHTML = `<div style="padding:12px;color:#94a3b8">Scanning Open-Meteo Geocoding API...</div>`;
  box.style.display = "block";

  try {
    const d = await api("/api/geocode?q=" + encodeURIComponent(q));
    box.innerHTML = "";
    if (!d.results || !d.results.length) {
      box.innerHTML = `<div style="padding:12px;color:#94a3b8">No matching locations found</div>`;
      return;
    }

    d.results.forEach(loc => {
      const b = document.createElement("button");
      b.textContent = [loc.name, loc.admin1 || loc.admin2, loc.country].filter(Boolean).join(", ");
      b.onclick = () => {
        applyLocationSelection(loc);
        box.style.display = "none";
        $("topSearchInput").value = "";
      };
      box.appendChild(b);
    });
  } catch (err) {
    box.innerHTML = `<div style="padding:12px;color:#f87171">${esc(err.message)}</div>`;
  }
}

async function triggerHeroSearch() {
  const input = $("heroSearchInput");
  if (!input) return;
  const q = input.value.trim();
  if (q.length < 2) return toast("Enter at least 2 characters to search.");
  const box = $("heroSearchResults");
  box.innerHTML = `<div style="padding:12px;color:#94a3b8">Scanning Open-Meteo Geocoding API...</div>`;
  box.style.display = "block";

  try {
    const d = await api("/api/geocode?q=" + encodeURIComponent(q));
    box.innerHTML = "";
    if (!d.results || !d.results.length) {
      box.innerHTML = `<div style="padding:12px;color:#94a3b8">No matching locations found for "${esc(q)}"</div>`;
      return;
    }

    d.results.forEach(loc => {
      const b = document.createElement("button");
      b.textContent = [loc.name, loc.admin1 || loc.admin2, loc.country].filter(Boolean).join(", ");
      b.onclick = () => {
        applyLocationSelection(loc);
        box.style.display = "none";
        input.value = "";
      };
      box.appendChild(b);
    });
  } catch (err) {
    box.innerHTML = `<div style="padding:12px;color:#f87171">${esc(err.message)}</div>`;
  }
}

document.addEventListener("click", e => {
  if (!e.target.closest(".top-search-wrap") && $("topSearchResults")) {
    $("topSearchResults").style.display = "none";
  }
  if (!e.target.closest(".hero-large-search") && $("heroSearchResults")) {
    $("heroSearchResults").style.display = "none";
  }
});

setTimeout(() => {
  if ($("topSearchInput")) {
    $("topSearchInput").addEventListener("keydown", e => {
      if (e.key === "Enter") triggerSearch();
    });
  }
  if ($("heroSearchInput")) {
    $("heroSearchInput").addEventListener("keydown", e => {
      if (e.key === "Enter") triggerHeroSearch();
    });
  }
}, 300);

function applyLocationSelection(loc) {
  selected = {
    name: [loc.name, loc.admin1 || loc.admin2, loc.country].filter(Boolean).join(", "),
    lat: Number(loc.latitude),
    lon: Number(loc.longitude),
    district: loc.admin2 || loc.admin1 || loc.name
  };

  $("heroSelectedLocation").textContent = selected.name;
  $("wCardLoc").textContent = selected.name;
  $("sidebarLocationLabel").textContent = selected.name.split(",")[0] + " Sector";
  $("sidebarCoords").textContent = `${selected.lat.toFixed(4)}° N, ${selected.lon.toFixed(4)}° E`;

  toast(`Sector shifted to ${selected.name}`);
  loadDashboardData();

  if (map) {
    map.setView([selected.lat, selected.lon], 11);
    setTimeout(() => map.invalidateSize(), 200);
  }
}

function autoDetectLocation() {
  if (!navigator.geolocation) return toast("GPS geolocation not supported by this browser.");
  toast("Querying browser GPS coordinates...");
  navigator.geolocation.getCurrentPosition(async p => {
    const lat = p.coords.latitude;
    const lon = p.coords.longitude;
    try {
      const g = await api(`/api/geocode?q=${lat.toFixed(3)},${lon.toFixed(3)}`);
      if (g.results && g.results[0]) {
        applyLocationSelection(g.results[0]);
      } else {
        applyLocationSelection({ name: "Current GPS Location", latitude: lat, longitude: lon });
      }
    } catch {
      applyLocationSelection({ name: "Current GPS Location", latitude: lat, longitude: lon });
    }
  }, err => {
    toast("GPS fix unavailable: " + err.message);
  }, { enableHighAccuracy: true, timeout: 8000 });
}

// ==============================================================
// 3. MAIN DASHBOARD DATA LOADERS
// ==============================================================
async function loadDashboardData() {
  loadLiveWeatherAndForecast();
  loadRecentHistory3Days();
  loadRiskScreening();
  loadSaferAreas();
  loadPeriodRainfall(currentPeriod);
  loadLandslideRecords();
  loadFloodRecords();
  loadFamilyContacts();
  loadReviews();
  loadMapMarkers();
}

// A. Live Weather & 7-Day Forecast (Matching reference images)
async function loadLiveWeatherAndForecast() {
  try {
    const w = await api(`/api/weather?lat=${selected.lat}&lon=${selected.lon}`);
    const cur = w.current || {};
    const daily = w.daily || {};
    const hourly = w.hourly || {};

    const code = cur.weather_code ?? 0;
    const info = decodeWeatherCode(code);

    // Weather Hero Card
    $("wCardDate").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" });
    $("wTemp").textContent = `${Math.round(cur.temperature_2m ?? 28)}°C`;
    $("wFeels").textContent = `Feels like ${Math.round(cur.apparent_temperature ?? 30)}°C`;
    $("wConditionText").textContent = info.label;
    $("wRainNow").textContent = `${Number(cur.precipitation ?? 0).toFixed(1)} mm`;
    $("wHumidity").textContent = `${cur.relative_humidity_2m ?? 65}%`;
    $("wWind").textContent = `${cur.wind_speed_10m ?? 12} km/h`;

    const soilM = hourly.soil_moisture_0_to_7cm ? hourly.soil_moisture_0_to_7cm[0] : 0.28;
    $("wSoilMoisture").textContent = `${Number(soilM ?? 0.28).toFixed(2)} m³/m³`;
    $("wUV").textContent = `${daily.uv_index_max ? daily.uv_index_max[0] : 5.8}`;

    // Rain probability
    const prob = daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 20;
    $("wRainProb").textContent = `${prob}%`;

    const hMax = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : 31;
    const lMin = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : 24;
    $("wHighLow").textContent = `H: ${hMax}°C · L: ${lMin}°C`;

    // Dynamic weather icon
    const iconHolder = $("wConditionIcon");
    if (iconHolder) {
      iconHolder.setAttribute("data-lucide", info.icon);
    }

    // 7-Day Daily Forecast List
    const days = daily.time || [];
    $("dailyForecastList").innerHTML = days.map((dStr, i) => {
      const d = new Date(dStr + "T00:00:00");
      const dayName = i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
      const cCode = daily.weather_code ? daily.weather_code[i] : 1;
      const cInfo = decodeWeatherCode(cCode);
      const rSum = Number(daily.precipitation_sum ? daily.precipitation_sum[i] : 0).toFixed(1);
      const maxT = Math.round(daily.temperature_2m_max ? daily.temperature_2m_max[i] : 30);
      const minT = Math.round(daily.temperature_2m_min ? daily.temperature_2m_min[i] : 24);

      return `
        <div class="daily-forecast-row">
          <span class="df-day">${dayName}</span>
          <div class="df-icon-wrap">
            <i data-lucide="${cInfo.icon}"></i>
            <span>${cInfo.label}</span>
          </div>
          <span class="df-rain">${rSum} mm</span>
          <span class="df-temps">${maxT}° / ${minT}°</span>
        </div>
      `;
    }).join("");

    // Horizontal Hourly Forecast Strip (Next 24 Hours)
    const hTimes = hourly.time || [];
    const hTemps = hourly.temperature_2m || [];
    const hRains = hourly.precipitation || [];
    const hProbs = hourly.precipitation_probability || [];
    const hCodes = hourly.weather_code || [];

    const nowIndex = 0;
    const next24 = hTimes.slice(nowIndex, nowIndex + 24);

    $("hourlyStrip").innerHTML = next24.map((tStr, idx) => {
      const i = nowIndex + idx;
      const t = new Date(tStr);
      const timeLabel = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
      const hInfo = decodeWeatherCode(hCodes[i] || 0);

      return `
        <div class="hourly-card">
          <span class="hc-time">${timeLabel}</span>
          <div class="hc-icon"><i data-lucide="${hInfo.icon}"></i></div>
          <span class="hc-temp">${Math.round(hTemps[i] || 27)}°</span>
          <span class="hc-rain">${Number(hRains[i] || 0).toFixed(1)} mm</span>
          <span class="hc-prob">${hProbs[i] ?? 0}% rain</span>
        </div>
      `;
    }).join("");

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Live weather error:", err);
  }
}

// B. Recent Weather History (Last 3 Days)
async function loadRecentHistory3Days() {
  try {
    const data = await api(`/api/weather/history?lat=${selected.lat}&lon=${selected.lon}&days=3`);
    const container = $("recentHistoryDays");
    if (!container) return;

    container.innerHTML = (data.days || []).map(day => {
      const isRain = day.status !== "No Rain";
      return `
        <div class="recent-day-card">
          <span class="rd-date">${new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
          <div class="rd-rain">${day.rainfall_mm} <small style="font-size:12px;color:#94a3b8">mm</small></div>
          <div>Max Temp: <b>${day.temp_max ? Math.round(day.temp_max) : '—'}°C</b></div>
          <span class="rd-status ${isRain ? 'rainy' : 'norain'}">${day.status}</span>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Recent history error:", err);
  }
}

// C. Location Safety Analysis (Experimental Dual Risk Screening)
async function loadRiskScreening() {
  try {
    const r = await api(`/api/risk?lat=${selected.lat}&lon=${selected.lon}&radius_km=10`);
    const sc = r.screening || {};

    // Flood
    const fScore = sc.flood?.score ?? 35;
    const fLevel = sc.flood?.level ?? "Moderate";
    $("floodRiskScore").textContent = fScore;
    $("floodRiskBadge").textContent = fLevel.toUpperCase();
    $("floodRiskBadge").className = "risk-badge " + fLevel.toLowerCase().replace(" ", "-");
    $("floodRiskFill").style.width = fScore + "%";
    $("floodRiskFill").style.background = fScore >= 75 ? "#ef4444" : fScore >= 50 ? "#f97316" : fScore >= 25 ? "#f59e0b" : "#10b981";

    $("floodRiskReasons").innerHTML = (sc.flood?.reasons || []).map(reason => `<li>${esc(reason)}</li>`).join("");

    // Landslide
    const lScore = sc.landslide?.score ?? 15;
    const lLevel = sc.landslide?.level ?? "Low";
    $("landslideRiskScore").textContent = lScore;
    $("landslideRiskBadge").textContent = lLevel.toUpperCase();
    $("landslideRiskBadge").className = "risk-badge " + lLevel.toLowerCase().replace(" ", "-");
    $("landslideRiskFill").style.width = lScore + "%";
    $("landslideRiskFill").style.background = lScore >= 75 ? "#ef4444" : lScore >= 50 ? "#f97316" : lScore >= 25 ? "#f59e0b" : "#10b981";

    $("landslideRiskReasons").innerHTML = (sc.landslide?.reasons || []).map(reason => `<li>${esc(reason)}</li>`).join("");
  } catch (err) {
    console.error("Risk screening error:", err);
  }
}

// D. Safer Nearby Area Comparison
async function loadSaferAreas() {
  try {
    const data = await api(`/api/safer-areas?lat=${selected.lat}&lon=${selected.lon}`);
    const tbody = $("saferAreasTableBody");
    if (!tbody) return;

    tbody.innerHTML = (data.candidates || []).map(c => `
      <tr>
        <td><strong>${esc(c.location_name)}</strong></td>
        <td class="font-mono text-cyan">${c.latitude}°, ${c.longitude}°</td>
        <td class="font-mono">${c.current_rainfall_mm} mm</td>
        <td class="font-mono text-emerald">${c.forecast_rainfall_48h_mm} mm</td>
        <td><span class="risk-badge ${c.risk_score > 50 ? 'high' : 'low'}">${c.risk_score} / 100</span></td>
        <td>
          <button class="btn-action-secondary" onclick="applyLocationSelection({name: '${esc(c.location_name)}', latitude: ${c.latitude}, longitude: ${c.longitude}})">
            Inspect Sector
          </button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Safer areas error:", err);
  }
}

// E. Period Rainfall Selection & Charts
async function selectRainfallPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll(".period-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.period === period);
  });
  loadPeriodRainfall(period);
}

async function selectHistoricalMonth(monthStr) {
  if (!monthStr) return;
  document.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
  try {
    toast(`Fetching observed monthly telemetry for ${monthStr}...`);
    const pData = await api(`/api/historical/period?lat=${selected.lat}&lon=${selected.lon}&month=${monthStr}`);
    $("periodTotalRain").textContent = `${pData.total_rainfall_mm ?? 0} mm`;
    $("periodAvgRain").textContent = `${pData.avg_rainfall_mm ?? 0} mm/d`;
    $("periodMaxRainDay").textContent = `${pData.max_rainfall_mm ?? 0} mm`;
    $("periodMaxRainDate").textContent = pData.max_rainfall_date || "N/A";
    $("periodRainyDays").textContent = `${pData.rainy_days_count ?? 0} Days`;
    renderPeriodDailyChart(pData.chart || []);
  } catch (err) {
    toast("Error loading month: " + err.message);
  }
}

async function applyCustomDateRange() {
  const start = $("historyStartDate")?.value;
  const end = $("historyEndDate")?.value;
  if (!start || !end) return toast("Please select both start and end dates.");
  if (start > end) return toast("Start date must be before end date.");
  document.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
  try {
    toast(`Filtering rainfall from ${start} to ${end}...`);
    const pData = await api(`/api/historical/period?lat=${selected.lat}&lon=${selected.lon}&start_date=${start}&end_date=${end}`);
    $("periodTotalRain").textContent = `${pData.total_rainfall_mm ?? 0} mm`;
    $("periodAvgRain").textContent = `${pData.avg_rainfall_mm ?? 0} mm/d`;
    $("periodMaxRainDay").textContent = `${pData.max_rainfall_mm ?? 0} mm`;
    $("periodMaxRainDate").textContent = pData.max_rainfall_date || "N/A";
    $("periodRainyDays").textContent = `${pData.rainy_days_count ?? 0} Days`;
    renderPeriodDailyChart(pData.chart || []);
  } catch (err) {
    toast("Error loading range: " + err.message);
  }
}

async function loadPeriodRainfall(period) {
  try {
    const pData = await api(`/api/historical/period?lat=${selected.lat}&lon=${selected.lon}&period=${period}`);
    $("periodTotalRain").textContent = `${pData.total_rainfall_mm ?? 0} mm`;
    $("periodAvgRain").textContent = `${pData.avg_rainfall_mm ?? 0} mm/d`;
    $("periodMaxRainDay").textContent = `${pData.max_rainfall_mm ?? 0} mm`;
    $("periodMaxRainDate").textContent = pData.max_rainfall_date || "N/A";
    $("periodRainyDays").textContent = `${pData.rainy_days_count ?? 0} Days`;

    // Render Daily Chart for Period
    renderPeriodDailyChart(pData.chart || []);
  } catch (err) {
    console.error("Period rainfall error:", err);
  }

  try {
    // NASA POWER 2-year monthly climate archive
    const mData = await api(`/api/historical/monthly?lat=${selected.lat}&lon=${selected.lon}&years=2`);
    renderMonthlyComparisonChart(mData.monthly || []);
  } catch (err) {
    console.error("Monthly comparison error:", err);
  }
}

function renderPeriodDailyChart(data) {
  const ctx = $("periodDailyChart");
  if (!ctx) return;
  if (periodDailyChart) periodDailyChart.destroy();

  const labels = data.map(d => d.date);
  const values = data.map(d => d.rainfall_mm);

  periodDailyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Observed Rainfall (mm)",
        data: values,
        backgroundColor: "rgba(0, 245, 255, 0.4)",
        borderColor: "#00f5ff",
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#94a3b8", font: { size: 10 } } },
        y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8", font: { size: 10 } } }
      }
    }
  });
}

function renderMonthlyComparisonChart(monthly) {
  const ctx = $("monthlyComparisonChart");
  if (!ctx) return;
  if (monthlyComparisonChart) monthlyComparisonChart.destroy();

  const recent14 = monthly.slice(-14);
  const labels = recent14.map(m => m.month);
  const values = recent14.map(m => m.rainfall_mm);

  monthlyComparisonChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "NASA POWER Monthly (mm)",
        data: values,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.15)",
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#94a3b8", font: { size: 10 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#94a3b8", font: { size: 10 } } },
        y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8", font: { size: 10 } } }
      }
    }
  });
}

// F. Historical Landslides & Floods
async function loadLandslideRecords() {
  const dist = $("lsDistrictFilter") ? $("lsDistrictFilter").value : "all";
  const yr = $("lsYearFilter") ? $("lsYearFilter").value : "all";
  const q = $("lsSearchQuery") ? $("lsSearchQuery").value.trim() : "";
  try {
    const params = new URLSearchParams();
    if (dist && dist !== "all") params.append("district", dist);
    if (yr && yr !== "all") params.append("year", yr);
    if (q) params.append("q", q);

    const data = await api(`/api/events/landslides?${params.toString()}`);
    const list = $("landslideList");
    if ($("landslideCountBadge")) $("landslideCountBadge").textContent = `${data.count} Verified Record(s)`;

    if (!data.records.length) {
      list.innerHTML = `<p style="padding:16px;color:#94a3b8;font-size:12px;">No verified landslide incident records are available for this location in the current dataset.</p>`;
      return;
    }

    list.innerHTML = data.records.map(r => `
      <div class="incident-item">
        <div class="incident-head">
          <span class="incident-loc">${esc(r.location)} (${esc(r.district)})</span>
          <span class="incident-badge ${r.verification_status === 'VERIFIED' ? 'verified' : 'sample'}">${esc(r.verification_status)}</span>
        </div>
        <p class="incident-desc">${esc(r.description)}</p>
        <span class="incident-src">Date: <b>${esc(r.event_date)}</b> · Source: <i>${esc(r.source)}</i></span>
      </div>
    `).join("");
  } catch (err) {
    console.error("Landslide load error:", err);
  }
}

async function loadFloodRecords() {
  const dist = $("flDistrictFilter") ? $("flDistrictFilter").value : "all";
  const m = $("flMonthFilter") ? $("flMonthFilter").value : "all";
  const q = $("flSearchQuery") ? $("flSearchQuery").value.trim() : "";
  try {
    const params = new URLSearchParams();
    if (dist && dist !== "all") params.append("district", dist);
    if (m && m !== "all") params.append("month", m);
    if (q) params.append("q", q);

    const data = await api(`/api/events/floods?${params.toString()}`);
    const list = $("floodList");
    if ($("floodCountBadge")) $("floodCountBadge").textContent = `${data.count} Verified Record(s)`;

    if (!data.records.length) {
      list.innerHTML = `<p style="padding:16px;color:#94a3b8;font-size:12px;">No verified flood incident records are available for this location in the current dataset.</p>`;
      return;
    }

    list.innerHTML = data.records.map(r => `
      <div class="incident-item">
        <div class="incident-head">
          <span class="incident-loc">${esc(r.location)} (${esc(r.district)})</span>
          <span class="incident-badge ${r.verification_status === 'VERIFIED' ? 'verified' : 'sample'}">${esc(r.verification_status)}</span>
        </div>
        <p class="incident-desc">${esc(r.description)}</p>
        <span class="incident-src">Date: <b>${esc(r.event_date)}</b> · Water Depth: <b>${r.water_level_m}m</b> · Source: <i>${esc(r.source)}</i></span>
      </div>
    `).join("");
  } catch (err) {
    console.error("Flood load error:", err);
  }
}

// G. Large Interactive Leaflet Map
function initLeafletMap() {
  if (map) {
    setTimeout(() => map.invalidateSize(), 200);
    return;
  }
  const el = $("interactiveMap");
  if (!el) return;
  map = L.map("interactiveMap", { zoomControl: true }).setView([selected.lat, selected.lon], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);

  mapMarkersLayer = L.layerGroup().addTo(map);

  // Click map to select pin
  map.on("click", e => {
    applyLocationSelection({
      name: `Point (${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)})`,
      latitude: e.latlng.lat,
      longitude: e.latlng.lng
    });
  });

  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 300);
}

function setMapFilter(layer) {
  currentMapFilter = layer;
  document.querySelectorAll(".layer-toggle-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.layer === layer);
  });
  loadMapMarkers();
}

async function loadMapMarkers() {
  if (!mapMarkersLayer) return;
  mapMarkersLayer.clearLayers();

  try {
    const data = await api(`/api/map/markers?lat=${selected.lat}&lon=${selected.lon}`);

    // Center Rainfall Marker
    if (currentMapFilter === "all" || currentMapFilter === "rain") {
      const rm = data.rainfall_marker;
      const colorHex = rm.color === "red" ? "#ef4444" : rm.color === "yellow" ? "#f59e0b" : "#10b981";
      const icon = L.divIcon({
        className: "custom-leaflet-marker",
        html: `<div style="background:${colorHex};width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:white;font-weight:bold;border:2px solid white;box-shadow:0 0 12px ${colorHex};">◎</div>`,
        iconSize: [26, 26]
      });
      L.marker([rm.latitude, rm.longitude], { icon }).addTo(mapMarkersLayer)
        .bindPopup(`<b>${esc(selected.name)}</b><br><span style="color:${colorHex}">● ${rm.indicator_label}</span><br>Current Rain: <b>${rm.current_rain_mm} mm</b>`);
    }

    // Shelters
    if (currentMapFilter === "all" || currentMapFilter === "shelters") {
      (data.shelters || []).forEach(s => {
        const icon = L.divIcon({
          className: "custom-leaflet-marker",
          html: `<div style="background:#10b981;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:white;font-size:12px;border:2px solid white;">⌂</div>`,
          iconSize: [22, 22]
        });
        L.marker([s.latitude, s.longitude], { icon }).addTo(mapMarkersLayer)
          .bindPopup(`<b>${esc(s.name)}</b><br>Type: ${esc(s.facility_type)}<br>Capacity: <b>${s.occupancy}/${s.capacity}</b><br>Officer: ${esc(s.contact_officer)} (${esc(s.phone)})`);
      });
    }

    // Landslides
    if (currentMapFilter === "all" || currentMapFilter === "landslides") {
      (data.landslides || []).forEach(l => {
        const icon = L.divIcon({
          className: "custom-leaflet-marker",
          html: `<div style="background:#d97706;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:white;font-size:12px;border:2px solid white;">▲</div>`,
          iconSize: [22, 22]
        });
        L.marker([l.latitude, l.longitude], { icon }).addTo(mapMarkersLayer)
          .bindPopup(`<b>Landslide Incident: ${esc(l.location)}</b><br>Date: ${l.event_date}<br>${esc(l.description)}<br>Status: <i>${esc(l.verification_status)}</i>`);
      });
    }

    // Floods
    if (currentMapFilter === "all" || currentMapFilter === "floods") {
      (data.floods || []).forEach(f => {
        const icon = L.divIcon({
          className: "custom-leaflet-marker",
          html: `<div style="background:#3b82f6;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:white;font-size:12px;border:2px solid white;">≋</div>`,
          iconSize: [22, 22]
        });
        L.marker([f.latitude, f.longitude], { icon }).addTo(mapMarkersLayer)
          .bindPopup(`<b>Flood Occurrence: ${esc(f.location)}</b><br>Date: ${f.event_date}<br>Depth: ${f.water_level_m}m<br>${esc(f.description)}`);
      });
    }

    // Emergency Reports
    if (currentMapFilter === "all" || currentMapFilter === "reports") {
      (data.emergency_reports || []).forEach(rep => {
        const icon = L.divIcon({
          className: "custom-leaflet-marker",
          html: `<div style="background:#ef4444;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:white;font-size:12px;border:2px solid white;animation:pulse 1.5s infinite;">!</div>`,
          iconSize: [22, 22]
        });
        L.marker([rep.latitude, rep.longitude], { icon }).addTo(mapMarkersLayer)
          .bindPopup(`<b>Emergency Report #${rep.id}</b><br>Type: ${esc(rep.report_type)}<br>Reporter: ${esc(rep.reporter_name)} (${esc(rep.phone)})<br>Status: <b>${esc(rep.status)}</b><br>${esc(rep.details)}`);
      });
    }
  } catch (err) {
    console.error("Map markers load error:", err);
  }
}

// ==============================================================
// 4. FAMILY CONTACTS & IN-APP WEATHER REMINDER
// ==============================================================
async function loadFamilyContacts() {
  try {
    const data = await api("/api/family");
    const container = $("familyCardsGrid");
    if (!container) return;

    if (!data.contacts.length) {
      container.innerHTML = `<p style="padding:16px;color:#94a3b8;grid-column:1/-1;">No family contacts registered yet. Click "Add Contact" to save your emergency network.</p>`;
      return;
    }

    container.innerHTML = data.contacts.map(c => `
      <div class="family-card">
        <div class="fam-card-head">
          <span class="fam-name">${esc(c.name)}</span>
          <span class="fam-rel">${esc(c.relationship)}</span>
        </div>
        <div class="fam-meta">📞 ${esc(c.phone)}</div>
        <div class="fam-meta">📍 ${esc(c.location || 'Local Sector')}</div>
        <button class="btn-send-reminder" onclick="sendWeatherReminderToContact(${c.id}, '${esc(c.name)}')">
          <i data-lucide="send"></i> Send Weather Reminder
        </button>
        <button class="btn-action-secondary" style="font-size:10px;padding:4px 8px;margin-top:4px;" onclick="deleteFamilyContact(${c.id})">
          Remove
        </button>
      </div>
    `).join("");

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Family contacts error:", err);
  }
}

function openFamilyModal() {
  $("familyModal").classList.remove("hidden");
}
function closeFamilyModal() {
  $("familyModal").classList.add("hidden");
}

async function handleFamilySubmit(e) {
  e.preventDefault();
  const name = $("famName").value.trim();
  const relationship = $("famRelation").value;
  const phone = $("famPhone").value.trim();
  const email = $("famEmail").value.trim();
  const location = $("famLocation").value.trim();

  try {
    await api("/api/family", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, relationship, phone, email, location })
    });
    closeFamilyModal();
    toast(`Contact saved: ${name} (${relationship})`);
    loadFamilyContacts();
  } catch (err) {
    toast("Error: " + err.message);
  }
}

async function deleteFamilyContact(id) {
  try {
    await api(`/api/family/${id}`, { method: "DELETE" });
    toast("Family contact deleted.");
    loadFamilyContacts();
  } catch (err) {
    toast(err.message);
  }
}

async function sendWeatherReminderToContact(contactId, name) {
  try {
    const res = await api("/api/family/reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        custom_message: `Heavy rainfall indicators are present near your saved location (${selected.name}). Please monitor official weather updates and stay alert.`
      })
    });
    toast(`✓ Weather safety reminder dispatched to ${name}. Saved to notification inbox.`);
    loadNotifications();
  } catch (err) {
    toast(err.message);
  }
}

// ==============================================================
// 5. USER REVIEWS & FEEDBACK
// ==============================================================
async function loadReviews() {
  try {
    const data = await api("/api/reviews");
    const container = $("reviewsGrid");
    if (!container) return;

    container.innerHTML = (data.reviews || []).slice(0, 6).map(r => `
      <div class="review-card">
        <div class="rev-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>
        <div class="rev-title">${esc(r.title)}</div>
        <p class="rev-msg">"${esc(r.message)}"</p>
        <span class="rev-author">— ${esc(r.user_name)} · <small>${r.created_at ? r.created_at.slice(0, 10) : 'Recent'}</small></span>
      </div>
    `).join("");
  } catch (err) {
    console.error("Reviews load error:", err);
  }
}

function openReviewModal() {
  $("reviewModal").classList.remove("hidden");
}
function closeReviewModal() {
  $("reviewModal").classList.add("hidden");
}
async function handleReviewSubmit(e) {
  e.preventDefault();
  const rating = Number($("revRating").value);
  const title = $("revTitle").value.trim();
  const message = $("revMessage").value.trim();

  try {
    await api("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, title, message })
    });
    closeReviewModal();
    toast("Thank you! Review posted successfully.");
    loadReviews();
  } catch (err) {
    toast("Error: " + err.message);
  }
}

// ==============================================================
// 6. NOTIFICATIONS INBOX
// ==============================================================
async function loadNotifications() {
  try {
    const data = await api("/api/notifications");
    const badge = $("unreadBadge");
    if (badge) {
      if (data.unread_count > 0) {
        badge.textContent = data.unread_count;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }

    const list = $("notifListWrap");
    if (list) {
      if (!data.notifications.length) {
        list.innerHTML = `<div style="padding:14px;color:#94a3b8;font-size:12px;">No active notifications</div>`;
        return;
      }
      list.innerHTML = data.notifications.map(n => `
        <div class="notif-item ${n.read_status === 0 ? 'unread' : ''}">
          <strong>${esc(n.title)}</strong>
          <p>${esc(n.message)}</p>
          <small>${n.created_at || 'Just now'}</small>
        </div>
      `).join("");
    }
  } catch (err) {
    console.error("Notifications error:", err);
  }
}

function toggleNotificationDropdown() {
  const dd = $("notifDropdown");
  if (dd) dd.classList.toggle("hidden");
}

async function markAllNotificationsRead(e) {
  e.stopPropagation();
  try {
    await api("/api/notifications/mark-all-read", { method: "POST" });
    loadNotifications();
    toast("All notifications marked as read.");
  } catch { }
}

// ==============================================================
// 7. PUBLIC INCIDENT REPORTING
// ==============================================================
function openReportModal() {
  $("reportModal").classList.remove("hidden");
}
function closeReportModal() {
  $("reportModal").classList.add("hidden");
}

async function handleReportSubmit(e) {
  e.preventDefault();
  const reporter_name = $("repName").value.trim();
  const phone = $("repPhone").value.trim();
  const report_type = $("repType").value;
  const location_name = $("repLocation").value.trim();
  const details = $("repDetails").value.trim();

  try {
    await api("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reporter_name,
        phone,
        latitude: selected.lat + (Math.random() - 0.5) * 0.02,
        longitude: selected.lon + (Math.random() - 0.5) * 0.02,
        location_name,
        district: selected.district,
        report_type,
        severity: "HIGH",
        details
      })
    });
    closeReportModal();
    toast("🚨 Incident report submitted and routed to Rescue Command Grid.");
    loadMapMarkers();
  } catch (err) {
    toast("Report Error: " + err.message);
  }
}

// ==============================================================
// 8. RESCUE TEAM DASHBOARD
// ==============================================================
let cachedRescueReports = [];
let currentRescueFilter = "ALL";
let rescueTacticalMap = null;
let rescueTacticalLayer = null;

async function loadRescueViewData() {
  try {
    const data = await api("/api/rescue/overview");
    $("rescueNewCount").textContent = data.new_reports_count;
    $("rescueActiveCount").textContent = data.in_progress_count;
    $("rescueResolvedCount").textContent = data.resolved_count;

    cachedRescueReports = data.reports || [];
    renderRescueTriageTable(cachedRescueReports);

    // Units Manifest with live Readiness Changer
    const uList = $("rescueUnitsList");
    if (uList) {
      uList.innerHTML = (data.rescue_units || []).map(u => `
        <div class="rescue-unit-box">
          <div class="rub-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong class="text-cyan font-mono">${esc(u.unit_code)} · ${esc(u.team_name || u.name)}</strong>
            <span class="risk-badge ${u.status === 'READY' ? 'low' : (u.status === 'DEPLOYED' ? 'critical' : 'moderate')}">${esc(u.status)}</span>
          </div>
          <div>Role: <b>${esc(u.unit_type || 'Disaster Response')}</b> (${u.personnel || 15} Rescuers)</div>
          <div>Sector: <b>${esc(u.district || 'Viluppuram')}</b></div>
          <div style="margin:4px 0;">Current Task: <i>${esc(u.assigned_task || 'Standby')}</i></div>
          <small style="color:#94a3b8;display:block;margin-bottom:8px;">Equipment: ${esc(u.equipment || 'Standard Kit')}</small>
          <div style="display:flex;align-items:center;gap:6px;background:rgba(15,23,42,0.6);padding:6px;border-radius:6px;">
            <small style="color:#cbd5e1;">Readiness:</small>
            <select style="background:#081122;color:white;border:1px solid #334155;border-radius:4px;padding:3px 6px;font-size:11px;" onchange="updateRescueUnitStatus(${u.id}, this.value)">
              <option value="READY" ${u.status === 'READY' ? 'selected' : ''}>READY (Standby)</option>
              <option value="DEPLOYED" ${u.status === 'DEPLOYED' ? 'selected' : ''}>DEPLOYED</option>
              <option value="EN_ROUTE" ${u.status === 'EN_ROUTE' ? 'selected' : ''}>EN ROUTE</option>
              <option value="RESTING" ${u.status === 'RESTING' ? 'selected' : ''}>RESTING</option>
            </select>
          </div>
        </div>
      `).join("");
    }

    // Initialize or Refresh Tactical Map
    initRescueTacticalMap(cachedRescueReports, data.rescue_units || []);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Rescue view error:", err);
  }
}

function filterRescueTriage(status) {
  currentRescueFilter = status;
  ["all", "new", "prog", "res"].forEach(k => {
    const btn = $(`flt-${k}`);
    if (btn) btn.classList.remove("active");
  });
  if (status === "ALL" && $("flt-all")) $("flt-all").classList.add("active");
  if (status === "NEW" && $("flt-new")) $("flt-new").classList.add("active");
  if (status === "IN_PROGRESS" && $("flt-prog")) $("flt-prog").classList.add("active");
  if (status === "RESOLVED" && $("flt-res")) $("flt-res").classList.add("active");

  renderRescueTriageTable(cachedRescueReports);
}

function renderRescueTriageTable(reports) {
  const tbody = $("rescueTriageTableBody");
  if (!tbody) return;

  const filtered = reports.filter(r => {
    if (currentRescueFilter === "ALL") return true;
    if (currentRescueFilter === "NEW") return r.status === "NEW";
    if (currentRescueFilter === "IN_PROGRESS") return r.status === "IN_PROGRESS" || r.status === "TEAM_ASSIGNED";
    if (currentRescueFilter === "RESOLVED") return r.status === "RESOLVED";
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:18px;color:#94a3b8;">No triage reports in category '${currentRescueFilter}'.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td class="font-mono">#${r.id}</td>
      <td><b>${esc(r.reporter_name)}</b><br><small class="text-cyan font-mono">📞 ${esc(r.phone)}</small></td>
      <td>${esc(r.report_type)}</td>
      <td>${esc(r.location_name)}</td>
      <td><span class="risk-badge ${(r.severity || '').toLowerCase()}">${esc(r.severity)}</span></td>
      <td><b>${esc(r.status)}</b></td>
      <td class="font-mono">${esc(r.assigned_unit || 'Unassigned')}</td>
      <td>
        <select style="background:#081122;color:white;border:1px solid #334155;border-radius:4px;padding:4px;" onchange="updateRescueReportStatus(${r.id}, this.value)">
          <option value="">Select Action...</option>
          <option value="ACKNOWLEDGED" ${r.status === 'ACKNOWLEDGED' ? 'selected' : ''}>Acknowledge</option>
          <option value="TEAM_ASSIGNED" ${r.status === 'TEAM_ASSIGNED' ? 'selected' : ''}>Assign Squad</option>
          <option value="IN_PROGRESS" ${r.status === 'IN_PROGRESS' ? 'selected' : ''}>In Progress</option>
          <option value="RESOLVED" ${r.status === 'RESOLVED' ? 'selected' : ''}>Mark Resolved</option>
        </select>
      </td>
    </tr>
  `).join("");
}

async function updateRescueReportStatus(reportId, newStatus) {
  if (!newStatus) return;
  try {
    await api(`/api/reports/${reportId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, assigned_unit: "SDRF-V1" })
    });
    toast(`✓ Report #${reportId} status updated to ${newStatus}`);
    loadRescueViewData();
  } catch (err) {
    toast("Status update error: " + err.message);
  }
}

async function updateRescueUnitStatus(unitId, newStatus) {
  if (!newStatus) return;
  try {
    await api(`/api/rescue/units/${unitId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        assigned_task: newStatus === "READY" ? "Standby readiness" : (newStatus === "DEPLOYED" ? "Active emergency deployment" : "Returning / Rest cycle")
      })
    });
    toast(`✓ Battalion unit #${unitId} marked as ${newStatus}`);
    loadRescueViewData();
  } catch (err) {
    toast("Unit readiness update failed: " + err.message);
  }
}

function initRescueTacticalMap(reports = [], units = []) {
  const el = $("rescueInteractiveMap");
  if (!el) return;

  if (!rescueTacticalMap) {
    rescueTacticalMap = L.map("rescueInteractiveMap", { zoomControl: true }).setView([selected.lat, selected.lon], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(rescueTacticalMap);
    rescueTacticalLayer = L.layerGroup().addTo(rescueTacticalMap);
  }

  setTimeout(() => {
    if (rescueTacticalMap) rescueTacticalMap.invalidateSize();
  }, 200);

  if (rescueTacticalLayer) {
    rescueTacticalLayer.clearLayers();

    // Emergency Incident SOS Pins
    reports.forEach(r => {
      const lat = Number(r.latitude) || (selected.lat + (Math.random() - 0.5) * 0.05);
      const lon = Number(r.longitude) || (selected.lon + (Math.random() - 0.5) * 0.05);
      const isCrit = (r.severity || "").toUpperCase() === "CRITICAL" || (r.severity || "").toUpperCase() === "HIGH";
      const pinColor = r.status === "RESOLVED" ? "#10b981" : (isCrit ? "#ef4444" : "#f59e0b");

      const pinHtml = `<div style="background:${pinColor};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px ${pinColor};"></div>`;
      const pinIcon = L.divIcon({ html: pinHtml, className: "custom-sos-pin", iconSize: [16, 16], iconAnchor: [8, 8] });

      const marker = L.marker([lat, lon], { icon: pinIcon });
      marker.bindPopup(`
        <div style="color:#0f172a;min-width:180px;font-family:sans-serif;">
          <strong style="color:#b91c1c;">⚠️ #${r.id} ${esc(r.report_type)}</strong><br>
          <small><b>Reporter:</b> ${esc(r.reporter_name)} (${esc(r.phone)})</small><br>
          <small><b>Location:</b> ${esc(r.location_name)}</small><br>
          <small><b>Status:</b> <b style="color:${pinColor}">${esc(r.status)}</b></small><br>
          <div style="margin-top:8px;">
            <button onclick="updateRescueReportStatus(${r.id}, 'IN_PROGRESS')" style="background:#0284c7;color:white;border:0;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;">Assign Squad & Dispatch</button>
          </div>
        </div>
      `);
      rescueTacticalLayer.addLayer(marker);
    });

    // Rescue Battalions Squad Icons
    units.forEach((u, idx) => {
      const uLat = selected.lat + (idx === 0 ? 0.025 : (idx === 1 ? -0.02 : (idx === 2 ? 0.018 : -0.015)));
      const uLon = selected.lon + (idx === 0 ? 0.02 : (idx === 1 ? 0.025 : (idx === 2 ? -0.02 : -0.018)));

      const squadHtml = `<div style="background:#0284c7;color:white;font-size:11px;font-weight:bold;padding:3px 7px;border-radius:12px;border:1.5px solid white;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);">🛡 ${esc(u.unit_code)}</div>`;
      const squadIcon = L.divIcon({ html: squadHtml, className: "custom-squad-pin", iconSize: [60, 22], iconAnchor: [30, 11] });
      const sm = L.marker([uLat, uLon], { icon: squadIcon });
      sm.bindPopup(`
        <div style="color:#0f172a;font-family:sans-serif;">
          <strong>🛡 ${esc(u.unit_code)} · ${esc(u.team_name || u.name)}</strong><br>
          <small><b>Readiness:</b> ${esc(u.status)}</small><br>
          <small><b>Personnel:</b> ${u.personnel || 15} Rescuers</small><br>
          <small><b>Assigned Task:</b> ${esc(u.assigned_task || 'Standby')}</small>
        </div>
      `);
      rescueTacticalLayer.addLayer(sm);
    });
  }
}

// ==============================================================
// 9. COLLECTOR / MUNICIPALITY DASHBOARD
// ==============================================================
async function loadCollectorViewData() {
  try {
    const data = await api("/api/collector/overview");
    $("colShelterPct").textContent = `${data.shelter_utilization_pct}%`;
    $("colShelterSub").textContent = `${data.shelter_occupancy} / ${data.shelter_capacity} Occupants`;
    $("colVerifiedCount").textContent = `${data.verified_landslides + data.verified_floods} Records`;
    $("colAlertsCount").textContent = `${data.alerts ? data.alerts.length : 0} Active`;

    // Official contacts list
    const ocList = $("officialContactsList");
    if (ocList) {
      ocList.innerHTML = (data.official_contacts || []).map(oc => `
        <div class="official-card">
          <strong>${esc(oc.name)}</strong> · <small style="color:#00f5ff">${esc(oc.designation)}</small><br>
          <span>Dept: ${esc(oc.department)} (${esc(oc.district)})</span><br>
          <span class="font-mono">📞 ${esc(oc.phone)} · ✉ ${esc(oc.email)}</span>
        </div>
      `).join("");
    }

    // Active Alerts List with Revoke Action
    renderCollectorAlertsList(data.alerts || []);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Collector view error:", err);
  }
}

async function loadCollectorSheltersTable() {
  const tbody = $("collectorSheltersTableBody");
  if (!tbody) return;
  try {
    const res = await api("/api/shelters");
    const shelters = res.shelters || [];
    tbody.innerHTML = shelters.map(s => {
      const pct = Math.round((s.occupancy / s.capacity) * 100);
      const isHigh = pct >= 85;
      return `
        <tr>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(s.district || 'Viluppuram')}</td>
          <td class="font-mono">${s.capacity}</td>
          <td class="font-mono"><b>${s.occupancy}</b></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="background:#1e293b;width:75px;height:8px;border-radius:4px;overflow:hidden;">
                <div style="background:${isHigh ? '#ef4444' : '#10b981'};width:${Math.min(100, pct)}%;height:100%;"></div>
              </div>
              <small class="font-mono">${pct}%</small>
            </div>
          </td>
          <td><small>${esc(s.contact_person)}<br><span class="font-mono text-cyan">📞 ${esc(s.contact_phone)}</span></small></td>
          <td><span class="risk-badge ${s.status === 'OPEN' ? 'low' : (s.status === 'FULL' ? 'critical' : 'moderate')}">${esc(s.status)}</span></td>
          <td>
            <div style="display:flex;gap:4px;">
              <input type="number" id="occ-input-${s.id}" value="${s.occupancy}" min="0" max="${s.capacity}" style="width:65px;background:#081122;color:white;border:1px solid #334155;border-radius:4px;padding:3px 6px;font-size:12px;">
              <button type="button" onclick="updateShelterOccupancy(${s.id})" style="background:#0284c7;color:white;border:0;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;">Update</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Shelters table load error:", err);
  }
}

async function updateShelterOccupancy(shelterId) {
  const inp = $(`occ-input-${shelterId}`);
  if (!inp) return;
  const newOcc = parseInt(inp.value, 10);
  if (isNaN(newOcc) || newOcc < 0) return toast("Enter a valid occupancy number.");
  try {
    const res = await api(`/api/shelters/${shelterId}/occupancy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occupancy: newOcc })
    });
    toast(`✓ Shelter '${res.shelter_name}' updated: ${res.occupancy}/${res.capacity} (${res.utilization_pct}%)`);
    loadCollectorViewData();
    loadCollectorSheltersTable();
  } catch (err) {
    toast("Shelter update failed: " + err.message);
  }
}

function renderCollectorAlertsList(alerts = []) {
  const el = $("collectorAlertsList");
  if (!el) return;
  if (alerts.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:24px;color:#94a3b8;">No active public directives currently transmitted.</div>`;
    return;
  }
  el.innerHTML = alerts.map(a => `
    <div style="background:rgba(15,23,42,0.85);border:1px solid ${a.severity === 'RED_ALERT' ? '#ef4444' : '#f59e0b'};border-radius:8px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <span class="risk-badge ${a.severity === 'RED_ALERT' ? 'critical' : 'moderate'}">${esc(a.severity)}</span>
        <button type="button" onclick="revokeCollectorAlert(${a.id})" style="background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid #ef4444;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Revoke</button>
      </div>
      <strong style="color:white;font-size:13px;display:block;">${esc(a.title)}</strong>
      <p style="font-size:12px;color:#cbd5e1;margin:4px 0 6px 0;">${esc(a.message)}</p>
      <small style="color:#38bdf8;">Districts: ${esc(a.target_districts || 'All Sectors')}</small>
    </div>
  `).join("");
}

async function revokeCollectorAlert(alertId) {
  if (!confirm("Revoke and deactivate this emergency broadcast directive?")) return;
  try {
    await api(`/api/collector/alerts/${alertId}`, { method: "DELETE" });
    toast("✓ Emergency directive revoked successfully.");
    loadCollectorViewData();
    loadNotifications();
  } catch (err) {
    toast("Revoke alert error: " + err.message);
  }
}

async function handleBroadcastSubmit(e) {
  e.preventDefault();
  const severity = $("bcastSeverity").value;
  const target_districts = $("bcastDistricts").value.trim();
  const title = $("bcastTitle").value.trim();
  const message = $("bcastMessage").value.trim();

  try {
    await api("/api/collector/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ severity, title, message, target_districts })
    });
    toast("🔴 Emergency directive published across all public dashboards!");
    $("bcastTitle").value = "";
    $("bcastMessage").value = "";
    loadCollectorViewData();
    loadNotifications();
  } catch (err) {
    toast(err.message);
  }
}

function downloadSampleCSVTemplate() {
  const sampleCSV = `event_date,latitude,longitude,location,district,description,source,type
2024-11-15,11.9401,79.4861,Viluppuram East Lowlands,Viluppuram,Gingee River Flash Inundation,Central Water Commission,flood
2023-12-04,11.9320,79.5020,Vanur Catchment Basin,Viluppuram,Severe Cyclone Michaung Rainfall Inundation,State Disaster Authority,flood
2024-07-20,11.4102,76.6950,Coonoor Ghat Section,The Nilgiris,Hill slope debris flow blocking NH-181,Geological Survey of India,landslide
2024-08-10,10.2381,77.4892,Kodaikanal Ghat KM-14,Dindigul,Monsoon rockfall and road blockage,State Highways Department,landslide`;

  const blob = new Blob([sampleCSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "astroguard_verified_incidents_template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("✓ Sample CSV template downloaded.");
}

async function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  $("csvUploadStatus").textContent = "Uploading & integrating verified records...";

  const fd = new FormData();
  fd.append("file", file);

  try {
    const res = await api("/api/events/import", {
      method: "POST",
      body: fd
    });
    $("csvUploadStatus").textContent = res.message;
    toast(res.message);
    loadLandslideRecords();
    loadFloodRecords();
    loadCollectorViewData();
  } catch (err) {
    $("csvUploadStatus").textContent = "Upload failed: " + err.message;
    toast(err.message);
  }
}

function openBroadcastModal() {
  const el = $("bcastSeverity");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
    toast("Broadcast Directive Console ready. Enter headline and details to transmit.");
  }
}

async function exportIncidentReports() {
  try {
    toast("Generating official DEOC reports CSV...");
    const url = (API_BASE || "") + "/api/collector/export?token=" + encodeURIComponent(token || "");
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error("Export failed. Collector authorization required.");
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `AstroGuard_DEOC_Incident_Reports_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
    toast("✓ Incident reports CSV downloaded successfully.");
  } catch (err) {
    toast("Export Error: " + err.message);
  }
}

// ==============================================================
// 10. ATMOSPHERIC WEATHER ENGINE: RAINDROPS, CLOUDY & BREEZY
// ==============================================================
function initWeatherAtmosphereEngine() {
  const canvas = $("weatherAtmosphereCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    initCloudLayers();
  });

  // Raindrops simulation with breezy slant
  const rainCount = Math.min(180, Math.max(80, Math.floor(width / 9)));
  const raindrops = [];
  const windAngle = 0.22; // Breezy angle to the right

  for (let i = 0; i < rainCount; i++) {
    raindrops.push({
      x: Math.random() * (width + 300) - 150,
      y: Math.random() * height,
      length: 14 + Math.random() * 20,
      speed: 13 + Math.random() * 12,
      thickness: 0.8 + Math.random() * 1.3,
      opacity: 0.16 + Math.random() * 0.32,
      splashProgress: 0,
      splashRadius: 0,
      splashX: 0,
      splashY: 0
    });
  }

  // Drifting Volumetric Cloud Layers
  let clouds = [];
  function initCloudLayers() {
    clouds = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      clouds.push({
        x: Math.random() * (width + 400) - 200,
        y: Math.random() * (height * 0.5),
        radiusX: 180 + Math.random() * 260,
        radiusY: 90 + Math.random() * 110,
        speed: 0.2 + Math.random() * 0.35, // Gentle breezy drift
        opacity: 0.08 + Math.random() * 0.12
      });
    }
  }
  initCloudLayers();

  // Breezy Wind Mist Streaks
  const breezeStreaks = [];
  for (let i = 0; i < 6; i++) {
    breezeStreaks.push({
      x: Math.random() * (width + 300) - 150,
      y: Math.random() * height,
      length: 140 + Math.random() * 220,
      speed: 6.5 + Math.random() * 6,
      thickness: 1.5 + Math.random() * 2.5,
      opacity: 0.05 + Math.random() * 0.1
    });
  }

  // Soft Ambient Lightning Flash variable
  let flashOpacity = 0;
  let nextFlashTime = Date.now() + 18000 + Math.random() * 15000;

  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Subtle distant cloud flash
    if (Date.now() > nextFlashTime) {
      flashOpacity = 0.18;
      nextFlashTime = Date.now() + 18000 + Math.random() * 15000;
    }
    if (flashOpacity > 0.002) {
      ctx.fillStyle = `rgba(224, 242, 254, ${flashOpacity})`;
      ctx.fillRect(0, 0, width, height);
      flashOpacity *= 0.88;
    }

    // 1. Render Drifting Volumetric Clouds (Luminous Silver-Sky)
    for (const c of clouds) {
      c.x += c.speed;
      if (c.x - c.radiusX > width) {
        c.x = -c.radiusX;
        c.y = Math.random() * (height * 0.5);
      }

      const grad = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, c.radiusX);
      grad.addColorStop(0, `rgba(224, 242, 254, ${c.opacity * 2.2})`);
      grad.addColorStop(0.35, `rgba(186, 230, 253, ${c.opacity * 1.5})`);
      grad.addColorStop(0.7, `rgba(125, 211, 252, ${c.opacity * 0.7})`);
      grad.addColorStop(1, "rgba(56, 189, 248, 0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.radiusX, c.radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Render Breezy Wind Streaks
    for (const b of breezeStreaks) {
      b.x += b.speed;
      b.y += b.speed * windAngle * 0.45;
      if (b.x > width + 200) {
        b.x = -b.length - 100;
        b.y = Math.random() * height;
      }

      const streakGrad = ctx.createLinearGradient(b.x, b.y, b.x + b.length, b.y + b.length * windAngle * 0.45);
      streakGrad.addColorStop(0, "rgba(56, 189, 248, 0)");
      streakGrad.addColorStop(0.5, `rgba(224, 242, 254, ${b.opacity * 1.4})`);
      streakGrad.addColorStop(1, "rgba(56, 189, 248, 0)");

      ctx.strokeStyle = streakGrad;
      ctx.lineWidth = b.thickness;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + b.length, b.y + b.length * windAngle * 0.45);
      ctx.stroke();
    }

    // 3. Render Raindrops & Base Splash Rings
    for (const drop of raindrops) {
      drop.x += drop.speed * windAngle;
      drop.y += drop.speed;

      // Draw splash ripple
      if (drop.splashProgress > 0) {
        drop.splashRadius += 0.9;
        drop.splashProgress -= 0.08;
        ctx.strokeStyle = `rgba(224, 242, 254, ${drop.splashProgress * 0.55})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(drop.splashX, drop.splashY, drop.splashRadius * 2, drop.splashRadius * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Check ground limit
      if (drop.y > height) {
        drop.splashX = drop.x;
        drop.splashY = height - 2;
        drop.splashProgress = 0.6;
        drop.splashRadius = 1;

        drop.y = -drop.length - Math.random() * 40;
        drop.x = Math.random() * (width + 300) - 150;
      }

      // Draw Drop Line
      ctx.strokeStyle = `rgba(224, 242, 254, ${drop.opacity * 1.4})`;
      ctx.lineWidth = drop.thickness;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + drop.length * windAngle, drop.y + drop.length);
      ctx.stroke();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

// ==============================================================
// 11. BOOTSTRAP INITIALIZATION
// ==============================================================
window.addEventListener("DOMContentLoaded", () => {
  initSession();
  initWeatherAtmosphereEngine();
});
