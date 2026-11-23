// ==============================================================
// ASTROGUARD AI — WEATHER & DISASTER RISK INTELLIGENCE PLATFORM
// CLIENT CONTROLLER & TELEMETRY ENGINE
// ==============================================================

const $ = id => document.getElementById(id);

// Master list of all 38 Tamil Nadu districts + Puducherry
let masterDistricts = [];

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

let cachedRescueReports = [];
let currentRescueFilter = "ALL";
let currentColFilter = "ALL";
let rescueTacticalMap = null;
let rescueTacticalLayer = null;

// WMO Weather interpretation table
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

function startClock() {
  setInterval(() => {
    const now = new Date();
    const utcStr = now.toUTCString().slice(17, 25) + " UTC";
    if ($("navClock")) $("navClock").textContent = utcStr;
  }, 1000);
}

// ==============================================================
// 1. INITIALIZATION & AUTHENTICATION
// ==============================================================
async function initSession() {
  startClock();
  if (window.lucide) lucide.createIcons();

  await loadDistrictsMaster();

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

  // Periodic automatic synchronization across dashboards (Part 16)
  setInterval(syncLiveUpdates, 9000);
}

async function loadDistrictsMaster() {
  try {
    const res = await api("/api/districts");
    masterDistricts = res.districts || [];
    populateDistrictSelectors();
  } catch (err) {
    console.error("Districts master load error:", err);
  }
}

function populateDistrictSelectors() {
  const selects = [
    $("topDistrictSelect"),
    $("heroDistrictSelect"),
    $("repDistrictSelect"),
    $("lsDistrictFilter"),
    $("flDistrictFilter"),
    $("publicShelterDistrictFilter"),
    $("rescueDistrictFilter"),
    $("colDistrictFilter")
  ];

  selects.forEach(sel => {
    if (!sel) return;
    const isFilter = sel.id.includes("Filter") || sel.id === "publicShelterDistrictFilter";
    const currentVal = sel.value;

    sel.innerHTML = isFilter
      ? `<option value="all">All 38 Districts & Puducherry</option>`
      : `<option value="">Select District...</option>`;

    masterDistricts.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.name;
      opt.textContent = `${d.name} (${d.type === 'Union Territory' ? 'UT' : 'District'})`;
      if (d.name === "Viluppuram" && !isFilter && !currentVal) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });

    if (currentVal) sel.value = currentVal;
  });
}

function handleDistrictDropdownChange(districtName) {
  if (!districtName || districtName === "all") return;
  const match = masterDistricts.find(d => d.name.toLowerCase() === districtName.toLowerCase());
  if (match) {
    applyLocationSelection({
      name: `${match.name}, ${match.state}, India`,
      district: match.name,
      latitude: match.latitude,
      longitude: match.longitude
    });
    toast(`Location updated to ${match.name} (${match.terrain})`);
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

  $("navUserName").textContent = currentUser.name;
  $("navUserRole").textContent = currentUser.role.toUpperCase() + (currentUser.is_verified ? " (VERIFIED)" : "");
  $("navAvatar").textContent = currentUser.name.charAt(0).toUpperCase();

  if ($("sidebarRoleName")) {
    $("sidebarRoleName").textContent = currentUser.role === "public" ? "Citizen Community" : (currentUser.role === "rescue" ? "Rescue First Responder" : "District DEOC Admin");
  }

  renderSidebarNav(currentUser.role);
  activateRoleDashboard(currentUser.role);

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
    toast(`Welcome, ${res.user.name}`);
    showAppShell();
  } catch (err) {
    toast("Sign In Failed: " + err.message);
  }
}

async function handleGuestLogin(role) {
  try {
    const res = await api(`/api/auth/guest/${role}`, { method: "POST" });
    token = res.token;
    localStorage.setItem("ag_token", token);
    currentUser = res.user;
    toast(`Quick Access: Signed in as ${res.user.name} (${role.toUpperCase()})`);
    showAppShell();
  } catch (err) {
    toast("Sign In Failed: " + err.message);
  }
}

function performLogout() {
  token = null;
  currentUser = null;
  localStorage.removeItem("ag_token");
  toast("Signed out successfully.");
  showAuthView();
}

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

function renderSidebarNav(role) {
  const menu = $("sidebarMenu");
  if (!menu) return;

  if (role === "public") {
    menu.innerHTML = `
      <button class="sb-link active" onclick="switchPublicSection('section-overview', this)"><i data-lucide="layout-grid"></i> Overview</button>
      <button class="sb-link" onclick="switchPublicSection('weatherMainCard', this)"><i data-lucide="sun"></i> Weather Telemetry</button>
      <button class="sb-link" onclick="switchPublicSection('hourlyStrip', this)"><i data-lucide="cloud-rain"></i> Rainfall Forecast</button>
      <button class="sb-link" onclick="switchPublicSection('section-risk', this)"><i data-lucide="shield-alert"></i> Risk Screening</button>
      <button class="sb-link" onclick="switchPublicSection('section-map', this)"><i data-lucide="map"></i> Disaster Map</button>
      <button class="sb-link" onclick="switchPublicSection('section-safer', this)"><i data-lucide="compass"></i> Safer Areas</button>
      <button class="sb-link" onclick="switchPublicSection('section-shelters', this)"><i data-lucide="home"></i> Relief Shelters</button>
      <button class="sb-link" onclick="switchPublicSection('section-my-reports', this)"><i data-lucide="file-text"></i> My Reports & Tracking</button>
      <button class="sb-link" onclick="switchPublicSection('section-history', this)"><i data-lucide="calendar"></i> Historical Data</button>
      <button class="sb-link" onclick="switchPublicSection('section-family', this)"><i data-lucide="users"></i> Family Contacts</button>
      <button class="sb-link" onclick="switchPublicSection('section-reviews', this)"><i data-lucide="star"></i> Reviews</button>
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
      <button class="sb-link" onclick="scrollToRoleSection('collectorTriageSection', this)"><i data-lucide="alert-octagon"></i> Incident Command Queue</button>
      <button class="sb-link" onclick="scrollToRoleSection('collectorShelterSection', this)"><i data-lucide="home"></i> Shelter Logistics</button>
      <button class="sb-link" onclick="scrollToRoleSection('collectorEmailSection', this)"><i data-lucide="mail"></i> Emergency Email Console</button>
      <button class="sb-link" onclick="scrollToRoleSection('collectorBroadcastSection', this)"><i data-lucide="radio"></i> Public Directives</button>
      <button class="sb-link" onclick="scrollToRoleSection('collectorContactsSection', this)"><i data-lucide="phone"></i> Official Directory</button>
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
    loadEmailConsoleOfficials();
  }
}

function scrollToRoleSection(targetId, btnEl) {
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
  if (currentUser && currentUser.role !== "public") {
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
  box.innerHTML = `<div style="padding:12px;color:#94a3b8">Scanning 38 Districts & Open-Meteo Geocoding...</div>`;
  box.style.display = "block";

  try {
    const d = await api("/api/geocode?q=" + encodeURIComponent(q));
    box.innerHTML = "";
    if (!d.results || !d.results.length) {
      box.innerHTML = `<div style="padding:12px;color:#94a3b8">No matching locations found in Tamil Nadu registry</div>`;
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
  box.innerHTML = `<div style="padding:12px;color:#94a3b8">Scanning 38 Districts & Open-Meteo Geocoding...</div>`;
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
        input.value = "";
      };
      box.appendChild(b);
    });
  } catch (err) {
    box.innerHTML = `<div style="padding:12px;color:#f87171">${esc(err.message)}</div>`;
  }
}

function autoDetectLocation() {
  if (!navigator.geolocation) return toast("Geolocation is not supported by your browser.");
  toast("Locating your coordinates via GPS...");
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      applyLocationSelection({
        name: `Current Location (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E)`,
        latitude: lat,
        longitude: lon,
        district: detectDistrictFromCoords(lat, lon)
      });
      toast(`GPS Location set: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    },
    err => {
      toast("GPS Detection Failed: " + err.message);
    },
    { timeout: 8000 }
  );
}

function detectDistrictFromCoords(lat, lon) {
  if (!masterDistricts.length) return "Viluppuram";
  let closest = masterDistricts[0];
  let minD = 999999;
  masterDistricts.forEach(d => {
    const dist = Math.hypot(lat - d.latitude, lon - d.longitude);
    if (dist < minD) {
      minD = dist;
      closest = d;
    }
  });
  return closest.name;
}

function applyLocationSelection(loc) {
  selected.name = [loc.name, loc.admin1].filter(Boolean).join(", ");
  selected.lat = Number(loc.latitude);
  selected.lon = Number(loc.longitude);

  // Match district
  const matched = masterDistricts.find(d =>
    (loc.name && loc.name.toLowerCase().includes(d.name.toLowerCase())) ||
    (loc.admin1 && loc.admin1.toLowerCase().includes(d.name.toLowerCase()))
  );
  selected.district = matched ? matched.name : (loc.district || detectDistrictFromCoords(selected.lat, selected.lon));

  // Update UI Labels
  if ($("heroSelectedLocation")) $("heroSelectedLocation").textContent = selected.name;
  if ($("wCardLoc")) $("wCardLoc").textContent = selected.name;
  if ($("sidebarLocationLabel")) $("sidebarLocationLabel").textContent = `${selected.district} Sector`;
  if ($("sidebarCoords")) $("sidebarCoords").textContent = `${selected.lat.toFixed(4)}° N, ${selected.lon.toFixed(4)}° E`;

  // Update dropdown values
  if ($("topDistrictSelect")) $("topDistrictSelect").value = selected.district;
  if ($("heroDistrictSelect")) $("heroDistrictSelect").value = selected.district;
  if ($("lsDistrictFilter")) $("lsDistrictFilter").value = selected.district;
  if ($("flDistrictFilter")) $("flDistrictFilter").value = selected.district;

  loadDashboardData();
  if (map) {
    map.flyTo([selected.lat, selected.lon], 12, { animate: true });
    loadMapMarkers();
  }
}

// ==============================================================
// 3. WEATHER TELEMETRY & RISK ENGINE (PARTS 3, 4, 5, 9, 17)
// ==============================================================
async function loadDashboardData() {
  await Promise.all([
    loadWeatherTelemetry(),
    loadRecentHistory(),
    loadRiskScreening(),
    loadSaferAreas(),
    loadPublicShelters(selected.district),
    loadCitizenReports(),
    loadPeriodRainfallData(),
    loadLandslideRecords(),
    loadFloodRecords(),
    loadFamilyContacts(),
    loadReviews(),
    loadGlobalAlerts()
  ]);
}

async function loadWeatherTelemetry() {
  try {
    const data = await api(`/api/weather?lat=${selected.lat}&lon=${selected.lon}`);
    const cur = data.current || {};
    const daily = data.daily || {};
    const hourly = data.hourly || {};

    const wDecoded = decodeWeatherCode(cur.weather_code);
    $("wConditionText").textContent = wDecoded.label;
    $("wConditionIcon").setAttribute("data-lucide", wDecoded.icon);

    $("wTemp").textContent = `${Math.round(cur.temperature_2m || 28)}°C`;
    $("wFeels").textContent = `Feels like ${Math.round(cur.apparent_temperature || cur.temperature_2m || 28)}°C`;

    const tMax = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : 32;
    const tMin = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : 24;
    $("wHighLow").textContent = `H: ${tMax}°C · L: ${tMin}°C`;

    $("wRainNow").textContent = `${Number(cur.precipitation || 0).toFixed(1)} mm`;
    const rProb = (daily.precipitation_probability_max && daily.precipitation_probability_max[0]) || 20;
    $("wRainProb").textContent = `${rProb}%`;
    $("wHumidity").textContent = `${cur.relative_humidity_2m || 75}%`;
    $("wWind").textContent = `${Math.round(cur.wind_speed_10m || 12)} km/h`;

    const soilVal = (hourly.soil_moisture_0_to_7cm && hourly.soil_moisture_0_to_7cm[0]) || 0.28;
    $("wSoilMoisture").textContent = `${Number(soilVal).toFixed(2)} m³/m³`;
    $("wUV").textContent = (daily.uv_index_max && daily.uv_index_max[0]) ? daily.uv_index_max[0] : "5.8";

    $("wCardDate").textContent = `Updated: ${new Date().toLocaleTimeString()} · Open-Meteo High-Resolution`;

    // Render 7-Day Forecast
    renderDailyForecast(daily);
    // Render Hourly Forecast
    renderHourlyForecast(hourly);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Weather load error:", err);
    toast("Weather Telemetry Error: " + err.message);
  }
}

function renderDailyForecast(daily) {
  const container = $("dailyForecastList");
  if (!container || !daily.time) return;

  const times = daily.time.slice(0, 7);
  const maxes = daily.temperature_2m_max || [];
  const mins = daily.temperature_2m_min || [];
  const rains = daily.precipitation_sum || [];
  const probs = daily.precipitation_probability_max || [];
  const codes = daily.weather_code || [];

  container.innerHTML = times.map((t, idx) => {
    const dayName = idx === 0 ? "Today" : new Date(t).toLocaleDateString("en-US", { weekday: "short" });
    const dec = decodeWeatherCode(codes[idx]);
    const rainSum = Number(rains[idx] || 0).toFixed(1);
    const prob = probs[idx] || 0;

    return `
      <div class="daily-forecast-row">
        <span class="df-day">${dayName}</span>
        <div class="df-icon-cond">
          <i data-lucide="${dec.icon}"></i>
          <span>${dec.label}</span>
        </div>
        <div class="df-rain-meta">
          <small class="text-cyan">${prob}% rain</small>
          <span class="font-mono">${rainSum} mm</span>
        </div>
        <div class="df-temps font-mono">
          <strong>${Math.round(maxes[idx] || 30)}°</strong>
          <span>${Math.round(mins[idx] || 22)}°</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderHourlyForecast(hourly) {
  const container = $("hourlyStrip");
  if (!container || !hourly.time) return;

  const times = hourly.time.slice(0, 24);
  const temps = hourly.temperature_2m || [];
  const rains = hourly.precipitation || [];
  const probs = hourly.precipitation_probability || [];

  container.innerHTML = times.map((t, idx) => {
    const hourLabel = new Date(t).toLocaleTimeString([], { hour: "numeric", hour12: true });
    const rVal = Number(rains[idx] || 0).toFixed(1);
    const pVal = probs[idx] || 0;

    return `
      <div class="hourly-card">
        <span class="hc-time font-mono">${hourLabel}</span>
        <i data-lucide="${rVal > 1.0 ? 'cloud-rain' : 'cloud'}" style="margin:6px 0;color:${rVal > 1.0 ? '#38bdf8' : '#94a3b8'};"></i>
        <span class="hc-temp font-mono">${Math.round(temps[idx] || 26)}°C</span>
        <span class="hc-rain text-cyan font-mono">${rVal}mm</span>
        <small class="hc-prob">${pVal}%</small>
      </div>
    `;
  }).join("");
}

async function loadRecentHistory() {
  try {
    const data = await api(`/api/weather/history?lat=${selected.lat}&lon=${selected.lon}&days=3`);
    const container = $("recentHistoryDays");
    if (!container) return;

    container.innerHTML = (data.days || []).map(d => `
      <div class="recent-day-card">
        <div class="rdc-date">${d.date}</div>
        <div class="rdc-metrics">
          <div>Rainfall: <strong class="font-mono text-cyan">${d.rainfall_mm} mm</strong></div>
          <div>Max Temp: <strong class="font-mono">${d.temp_max !== null ? d.temp_max + '°C' : '--'}</strong></div>
          <div>Status: <span class="badge-tag">${esc(d.status)}</span></div>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Recent history error:", err);
  }
}

// SEPARATE FLOOD & LANDSLIDE RISK SCREENING (PARTS 4 & 5)
async function loadRiskScreening() {
  try {
    const data = await api(`/api/risk?lat=${selected.lat}&lon=${selected.lon}&district=${encodeURIComponent(selected.district)}`);
    const f = data.flood_screening || {};
    const l = data.landslide_screening || {};

    // 1. Flood Card
    $("floodRiskScore").textContent = f.score;
    $("floodRiskBadge").textContent = f.level.toUpperCase();
    $("floodRiskBadge").className = `risk-badge ${f.level.toLowerCase()}`;
    $("floodRiskFill").style.width = `${f.score}%`;
    $("floodRiskReasons").innerHTML = (f.risk_factors || []).map(r => `<div>• ${esc(r)}</div>`).join("");
    if ($("floodDataAvail")) $("floodDataAvail").textContent = f.data_availability || "Full Telemetry Available";

    // 2. Landslide Card
    $("landslideRiskScore").textContent = l.score;
    $("landslideRiskBadge").textContent = l.level.toUpperCase();
    $("landslideRiskBadge").className = `risk-badge ${l.level.toLowerCase()}`;
    $("landslideRiskFill").style.width = `${l.score}%`;
    $("landslideRiskReasons").innerHTML = (l.risk_factors || []).map(r => `<div>• ${esc(r)}</div>`).join("");
    if ($("landslideTerrainStatus")) $("landslideTerrainStatus").textContent = l.terrain_status || "Lowland Plains";

  } catch (err) {
    console.error("Risk screening load error:", err);
  }
}

async function loadSaferAreas() {
  try {
    const data = await api(`/api/safer-areas?lat=${selected.lat}&lon=${selected.lon}&district=${encodeURIComponent(selected.district)}`);
    const tbody = $("saferAreasTableBody");
    if (!tbody) return;

    tbody.innerHTML = (data.candidates || []).map(c => `
      <tr>
        <td>
          <strong>${esc(c.name)}</strong><br>
          <small style="color:#94a3b8;">${esc(c.address || c.town)}</small>
        </td>
        <td><span class="badge-tag">${esc(c.category || 'Sector')}</span></td>
        <td class="font-mono text-cyan">${c.distance_km} km</td>
        <td class="font-mono">${c.current_rainfall_mm} mm</td>
        <td class="font-mono">${c.forecast_rainfall_48h_mm} mm</td>
        <td>
          <span class="risk-badge ${c.risk_color}">${esc(c.risk_label)}</span>
        </td>
        <td>
          <button class="btn-action-secondary" style="font-size:11px;padding:4px 8px;" onclick="inspectSaferLocation(${c.lat}, ${c.lon}, '${esc(c.name)}')">
            Inspect Area
          </button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Safer areas load error:", err);
  }
}

function inspectSaferLocation(lat, lon, name) {
  applyLocationSelection({
    name: name,
    latitude: lat,
    longitude: lon,
    district: selected.district
  });
  switchPublicSection("weatherMainCard");
}

// RELIEF SHELTERS DIRECTORY (PARTS 17 & 18)
async function loadPublicShelters(district = "all") {
  const tbody = $("publicSheltersTableBody");
  if (!tbody) return;
  try {
    const res = await api(`/api/shelters?district=${encodeURIComponent(district)}`);
    const shelters = res.shelters || [];
    if (!shelters.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:16px;color:#94a3b8;">No registered shelters found for district '${district}'.</td></tr>`;
      return;
    }
    tbody.innerHTML = shelters.map(s => {
      const pct = s.occupancy_percentage || Math.round((s.occupancy / s.capacity) * 100);
      const isHigh = pct >= 85;
      return `
        <tr>
          <td>
            <strong>${esc(s.name)}</strong><br>
            <small style="color:#00f5ff;">${esc(s.facility_type)}</small>
          </td>
          <td>${esc(s.district)} (${esc(s.town || s.district)})</td>
          <td><small>${esc(s.address || 'Designated Shelter Center')}</small></td>
          <td class="font-mono">${s.capacity}</td>
          <td class="font-mono"><b>${s.occupancy}</b></td>
          <td class="font-mono text-emerald"><b>${s.available_capacity}</b></td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="background:#1e293b;width:55px;height:6px;border-radius:3px;overflow:hidden;">
                <div style="background:${isHigh ? '#ef4444' : '#10b981'};width:${Math.min(100, pct)}%;height:100%;"></div>
              </div>
              <small class="font-mono">${pct}%</small>
            </div>
          </td>
          <td><span class="risk-badge ${s.status === 'OPEN' ? 'low' : (s.status === 'FULL' ? 'critical' : 'moderate')}">${esc(s.status)}</span></td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Shelters error:", err);
  }
}

// ==============================================================
// 4. CITIZEN MY REPORTS & ACTION TRACKING (PART 15)
// ==============================================================
async function loadCitizenReports() {
  const container = $("citizenReportsList");
  if (!container) return;

  try {
    const res = await api("/api/reports");
    const reports = res.reports || [];

    if (!reports.length) {
      container.innerHTML = `<p style="padding:16px;color:#94a3b8;font-size:13px;">You have not logged any emergency reports yet. Click 'Submit New Report' to report an active hazard.</p>`;
      return;
    }

    container.innerHTML = reports.map(r => {
      const steps = ["Received", "Acknowledged", "In Progress", "Action Taken", "Finished", "Resolved Successfully"];
      const currentIdx = steps.indexOf(r.status);
      const isEscalated = r.status === "Unable to Resolve – Escalated";

      return `
        <div class="citizen-report-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
            <div>
              <span class="font-mono text-cyan" style="font-weight:700;">REPORT #${r.id}</span>
              <h4 style="margin:4px 0;">${esc(r.report_type)} — ${esc(r.location_name)}</h4>
              <small style="color:#94a3b8;">${esc(r.district)} · Logged on ${r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : 'Recent'}</small>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span class="priority-pill ${(r.priority_level || 'medium').toLowerCase()}">
                AI TRIAGE: ${esc(r.priority_level)} (${r.priority_score}%)
              </span>
              <span class="risk-badge ${r.status === 'Resolved Successfully' ? 'low' : (isEscalated ? 'critical' : 'moderate')}">
                ${esc(r.status)}
              </span>
            </div>
          </div>

          <p style="font-size:13px;color:#e2e8f0;margin:10px 0;">"${esc(r.details)}"</p>
          <small style="color:#38bdf8;">Assigned Unit: <b>${esc(r.assigned_unit || 'Rescue Team Triage Pending')}</b></small>

          <!-- Interactive Workflow Timeline Stepper -->
          <div class="workflow-stepper">
            ${steps.map((st, sIdx) => {
        const isCompleted = currentIdx >= sIdx;
        const isActive = currentIdx === sIdx;
        return `
                <div class="step-node ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
                  <div class="step-dot">${isCompleted ? '✓' : (sIdx + 1)}</div>
                  <span class="step-label">${st}</span>
                </div>
              `;
      }).join("")}
          </div>

          ${isEscalated ? `<div style="background:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#fca5a5;padding:8px 12px;border-radius:6px;font-size:12px;margin-top:8px;">⚠️ Escalated to District Collectorate / State Disaster Response Authority.</div>` : ''}

          <!-- View Action Thread / Replies button -->
          <div style="margin-top:12px;">
            <button class="btn-action-secondary" style="font-size:11px;padding:4px 10px;" onclick="viewReportHistoryDetail(${r.id})">
              <i data-lucide="history"></i> View Official Log & Replies
            </button>
          </div>
        </div>
      `;
    }).join("");

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Citizen reports error:", err);
  }
}

// ==============================================================
// 5. RESCUE TEAM DASHBOARD & TRIAGE (PARTS 11, 12, 13)
// ==============================================================
async function loadRescueViewData() {
  try {
    const data = await api("/api/rescue/overview");
    $("rescueNewCount").textContent = data.new_reports_count;
    $("rescueActiveCount").textContent = data.in_progress_count;
    $("rescueResolvedCount").textContent = data.resolved_count;

    cachedRescueReports = data.reports || [];
    renderRescueTriageTable(cachedRescueReports);

    // Render units manifest
    const uList = $("rescueUnitsList");
    if (uList) {
      uList.innerHTML = (data.rescue_units || []).map(u => `
        <div class="rescue-unit-box">
          <div class="rub-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong class="text-cyan font-mono">${esc(u.unit_code)} · ${esc(u.team_name || u.name)}</strong>
            <span class="risk-badge ${u.status === 'READY' ? 'low' : (u.status === 'DEPLOYED' ? 'critical' : 'moderate')}">${esc(u.status)}</span>
          </div>
          <div>Role: <b>${esc(u.unit_type || 'Disaster Response')}</b> (${u.personnel || 15} Rescuers)</div>
          <div>Location: <b>${u.lat.toFixed(3)}°N, ${u.lon.toFixed(3)}°E</b></div>
          <div style="margin:4px 0;">Current Task: <i>${esc(u.assigned_task || 'Standby')}</i></div>
          <small style="color:#94a3b8;display:block;margin-bottom:8px;">Kit: ${esc(u.equipment || 'Standard Gear')}</small>
          <div style="display:flex;align-items:center;gap:6px;background:rgba(15,23,42,0.6);padding:6px;border-radius:6px;">
            <small style="color:#cbd5e1;">Readiness:</small>
            <select style="background:#081122;color:white;border:1px solid #334155;border-radius:4px;padding:3px 6px;font-size:11px;" onchange="updateRescueUnitStatus(${u.id}, this.value)">
              <option value="READY" ${u.status === 'READY' ? 'selected' : ''}>READY (Standby)</option>
              <option value="DEPLOYED" ${u.status === 'DEPLOYED' ? 'selected' : ''}>DEPLOYED</option>
              <option value="ON_SCENE" ${u.status === 'ON_SCENE' ? 'selected' : ''}>ON SCENE</option>
              <option value="STANDBY" ${u.status === 'STANDBY' ? 'selected' : ''}>STANDBY</option>
            </select>
          </div>
        </div>
      `).join("");
    }

    initRescueTacticalMap(cachedRescueReports, data.rescue_units || []);
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Rescue view error:", err);
  }
}

function filterRescueTriage(status) {
  currentRescueFilter = status;
  ["all", "crit", "new", "prog", "res"].forEach(k => {
    const btn = $(`flt-${k}`);
    if (btn) btn.classList.remove("active");
  });
  if (status === "ALL" && $("flt-all")) $("flt-all").classList.add("active");
  if (status === "CRITICAL" && $("flt-crit")) $("flt-crit").classList.add("active");
  if (status === "Received" && $("flt-new")) $("flt-new").classList.add("active");
  if (status === "IN_PROGRESS" && $("flt-prog")) $("flt-prog").classList.add("active");
  if (status === "RESOLVED" && $("flt-res")) $("flt-res").classList.add("active");

  renderRescueTriageTable(cachedRescueReports);
}

function filterRescueReports() {
  const dist = $("rescueDistrictFilter") ? $("rescueDistrictFilter").value : "all";
  renderRescueTriageTable(cachedRescueReports, dist);
}

function renderRescueTriageTable(reports, distFilter = "all") {
  const tbody = $("rescueTriageTableBody");
  if (!tbody) return;

  const filtered = reports.filter(r => {
    if (distFilter !== "all" && r.district.toLowerCase() !== distFilter.toLowerCase()) return false;
    if (currentRescueFilter === "ALL") return true;
    if (currentRescueFilter === "CRITICAL") return r.priority_level === "CRITICAL";
    if (currentRescueFilter === "Received") return r.status === "Received" || r.status === "NEW";
    if (currentRescueFilter === "IN_PROGRESS") return ["Acknowledged", "In Progress", "Action Taken", "TEAM_ASSIGNED"].includes(r.status);
    if (currentRescueFilter === "RESOLVED") return ["Finished", "Resolved Successfully", "RESOLVED"].includes(r.status);
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:18px;color:#94a3b8;">No incident reports matching active filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td class="font-mono">#${r.id}</td>
      <td>
        <b>${esc(r.reporter_name)}</b><br>
        <small class="text-cyan font-mono">📞 ${esc(r.phone)}</small>
      </td>
      <td>${esc(r.report_type)}</td>
      <td>
        <strong>${esc(r.district)}</strong><br>
        <small style="color:#cbd5e1;">${esc(r.location_name)}</small>
      </td>
      <td>
        <span class="priority-pill ${(r.priority_level || 'medium').toLowerCase()}">
          ${esc(r.priority_level)} (${r.priority_score}%)
        </span>
        <div class="priority-bar-track">
          <div class="priority-bar-fill ${(r.priority_level || 'medium').toLowerCase()}" style="width:${r.priority_score}%;"></div>
        </div>
      </td>
      <td><span class="risk-badge ${(r.severity || '').toLowerCase()}">${esc(r.status)}</span></td>
      <td class="font-mono text-cyan">${esc(r.assigned_unit || 'Unassigned')}</td>
      <td>
        <button class="btn-action-primary" style="font-size:11px;padding:4px 8px;" onclick="openActionModal(${r.id})">
          <i data-lucide="edit"></i> Action / Reply
        </button>
      </td>
    </tr>
  `).join("");

  if (window.lucide) lucide.createIcons();
}

// ==============================================================
// 6. COLLECTOR DASHBOARD & COMPLETE WORKFLOW (PARTS 14, 19, 20)
// ==============================================================
async function loadCollectorViewData() {
  try {
    const data = await api("/api/collector/overview");
    $("colShelterPct").textContent = `${data.shelter_utilization_pct}%`;
    $("colShelterSub").textContent = `${data.shelter_occupancy} / ${data.shelter_capacity} Occupants`;
    $("colVerifiedCount").textContent = `${data.verified_landslides + data.verified_floods} Records`;
    $("colAlertsCount").textContent = `${data.alerts ? data.alerts.length : 0} Active`;

    // Render COMPLETE Emergency Incident Queue in Collector Dashboard (Part 14)
    cachedRescueReports = data.reports || [];
    renderCollectorTriageTable(cachedRescueReports);

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

    renderCollectorAlertsList(data.alerts || []);
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Collector view error:", err);
  }
}

function filterColTriage(status) {
  currentColFilter = status;
  ["all", "crit", "new", "prog", "res"].forEach(k => {
    const btn = $(`col-flt-${k}`);
    if (btn) btn.classList.remove("active");
  });
  if (status === "ALL" && $("col-flt-all")) $("col-flt-all").classList.add("active");
  if (status === "CRITICAL" && $("col-flt-crit")) $("col-flt-crit").classList.add("active");
  if (status === "Received" && $("col-flt-new")) $("col-flt-new").classList.add("active");
  if (status === "IN_PROGRESS" && $("col-flt-prog")) $("col-flt-prog").classList.add("active");
  if (status === "RESOLVED" && $("col-flt-res")) $("col-flt-res").classList.add("active");

  renderCollectorTriageTable(cachedRescueReports);
}

function filterCollectorReports() {
  const dist = $("colDistrictFilter") ? $("colDistrictFilter").value : "all";
  renderCollectorTriageTable(cachedRescueReports, dist);
}

// Complete Incident Queue in Collector Dashboard (Part 14)
function renderCollectorTriageTable(reports, distFilter = "all") {
  const tbody = $("collectorTriageTableBody");
  if (!tbody) return;

  const filtered = reports.filter(r => {
    if (distFilter !== "all" && r.district.toLowerCase() !== distFilter.toLowerCase()) return false;
    if (currentColFilter === "ALL") return true;
    if (currentColFilter === "CRITICAL") return r.priority_level === "CRITICAL";
    if (currentColFilter === "Received") return r.status === "Received" || r.status === "NEW";
    if (currentColFilter === "IN_PROGRESS") return ["Acknowledged", "In Progress", "Action Taken", "TEAM_ASSIGNED"].includes(r.status);
    if (currentColFilter === "RESOLVED") return ["Finished", "Resolved Successfully", "RESOLVED"].includes(r.status);
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:18px;color:#94a3b8;">No incident records matching current filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td class="font-mono">#${r.id}</td>
      <td>
        <b>${esc(r.reporter_name)}</b><br>
        <small class="text-cyan font-mono">📞 ${esc(r.phone)}</small>
      </td>
      <td>${esc(r.report_type)}</td>
      <td>
        <strong>${esc(r.district)}</strong><br>
        <small style="color:#cbd5e1;">${esc(r.location_name)}</small>
      </td>
      <td>
        <span class="priority-pill ${(r.priority_level || 'medium').toLowerCase()}">
          ${esc(r.priority_level)} (${r.priority_score}%)
        </span>
        <div class="priority-bar-track">
          <div class="priority-bar-fill ${(r.priority_level || 'medium').toLowerCase()}" style="width:${r.priority_score}%;"></div>
        </div>
      </td>
      <td><span class="risk-badge ${(r.severity || '').toLowerCase()}">${esc(r.status)}</span></td>
      <td class="font-mono text-cyan">${esc(r.assigned_unit || 'Unassigned')}</td>
      <td>
        <button class="btn-action-primary" style="font-size:11px;padding:4px 8px;" onclick="openActionModal(${r.id})">
          <i data-lucide="shield"></i> Oversee / Directive
        </button>
      </td>
    </tr>
  `).join("");

  if (window.lucide) lucide.createIcons();
}

// COLLECTOR EMERGENCY EMAIL DIRECTIVE CONSOLE (PART 20)
let cachedOfficialContacts = [];
async function loadEmailConsoleOfficials() {
  const container = $("emailRecipientList");
  if (!container) return;
  try {
    const res = await api("/api/collector/official-contacts");
    cachedOfficialContacts = res.contacts || [];
    container.innerHTML = cachedOfficialContacts.map(c => `
      <label class="contact-select-item">
        <input type="checkbox" name="email_contact_cb" value="${c.id}" checked>
        <div>
          <strong>${esc(c.name)}</strong> · <small style="color:#38bdf8;">${esc(c.designation)} (${esc(c.department)})</small>
          <div style="font-size:11px;color:#94a3b8;">${esc(c.district)} · ${esc(c.email)}</div>
        </div>
      </label>
    `).join("");
    applyEmailTemplate("Critical Flood Emergency");
  } catch (err) {
    console.error("Official contacts email load error:", err);
  }
}

function applyEmailTemplate(templateName) {
  const sub = $("emailSubjectInput");
  const msg = $("emailMessageInput");
  if (!sub || !msg) return;

  sub.value = `OFFICIAL DEOC EMERGENCY DIRECTIVE: ${templateName.toUpperCase()} — ${selected.district.toUpperCase()}`;

  const templates = {
    "Critical Flood Emergency": "Immediate inter-departmental mobilization ordered for low-lying taluks. Ensure evacuation shelters are operational, high-capacity dewatering pumps stationed at causeways, and medical teams on standby.",
    "Critical Landslide Emergency": "High-slope failure warning issued for hill road passes. Traffic halted on arterial ghat corridors. SDRF mountain rescue squad dispatched to clear debris and secure residents.",
    "Medical Rescue Required": "Urgent medical evacuation required for trapped citizens. Swiftwater boat extraction craft deployed. Emergency health facilities alerted for trauma care.",
    "Road Blockage": "Embankment slump / uprooted timber blocking arterial highway. Highways Department and Fire & Rescue units deployed with power winches for immediate clearance.",
    "Building Collapse": "Structural failure reported. NDRF search and rescue squad mobilized with acoustic listening devices and hydraulic cutting equipment.",
    "Urgent District-Level Action Required": "Executive directive from District Collectorate: All department heads to maintain active communication with DEOC situation room."
  };

  msg.value = templates[templateName] || "Immediate inter-departmental emergency response directive.";
}

async function dispatchCollectorEmergencyEmail() {
  const checkboxes = document.querySelectorAll("input[name='email_contact_cb']:checked");
  const contactIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));

  if (!contactIds.length) {
    return toast("Please select at least one recipient official.");
  }

  const template_name = $("emailTemplateSelect").value;
  const custom_subject = $("emailSubjectInput").value.trim();
  const custom_message = $("emailMessageInput").value.trim();
  const logBox = $("emailDispatchLog");

  logBox.innerHTML = `<span style="color:#38bdf8;">Connecting to SMTP server & transmitting official directives...</span>`;

  try {
    const res = await api("/api/collector/send-emergency-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_ids: contactIds,
        template_name,
        custom_subject,
        custom_message
      })
    });

    const isSuccess = res.all_delivered;
    logBox.innerHTML = `
      <div style="background:${isSuccess ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};border:1px solid ${isSuccess ? '#10b981' : '#ef4444'};padding:10px;border-radius:6px;">
        <strong>${isSuccess ? '✓ Email Dispatched Successfully' : '⚠️ SMTP Notification'}</strong>
        <p style="margin:4px 0;">${isSuccess ? 'Official directives delivered to all selected verified contacts.' : 'Server SMTP service unconfigured (set SMTP_HOST & SMTP_USERNAME) or transfer blocked. Communication logged in registry.'}</p>
      </div>
    `;
    toast(isSuccess ? "✓ Official emergency directive sent via email." : "SMTP unconfigured: logged in registry.");
  } catch (err) {
    logBox.innerHTML = `<span style="color:#ef4444;">Error: ${esc(err.message)}</span>`;
    toast("Email Error: " + err.message);
  }
}

// ==============================================================
// 7. INCIDENT ACTION & REPLY MODAL (PARTS 13 & 14)
// ==============================================================
let activeActionReportId = null;

async function openActionModal(reportId) {
  activeActionReportId = reportId;
  const modal = $("incidentActionModal");
  const content = $("actionModalContent");
  if (!modal || !content) return;

  modal.classList.remove("hidden");
  content.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;">Loading incident workflow data...</div>`;

  try {
    const res = await api(`/api/reports/${reportId}`);
    const r = res.report;
    const history = res.status_history || [];
    const replies = res.replies || [];

    content.innerHTML = `
      <div style="margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <span class="font-mono text-cyan" style="font-weight:700;">INCIDENT #${r.id}</span>
            <h3 style="margin:2px 0;">${esc(r.report_type)}</h3>
            <small style="color:#94a3b8;">${esc(r.reporter_name)} (📞 ${esc(r.phone)}) · 📍 ${esc(r.location_name)} (${esc(r.district)})</small>
          </div>
          <span class="priority-pill ${(r.priority_level || 'medium').toLowerCase()}">
            ${esc(r.priority_level)} (${r.priority_score}%)
          </span>
        </div>
        <p style="background:rgba(15,23,42,0.6);padding:10px;border-radius:6px;font-size:13px;margin-top:8px;">"${esc(r.details)}"</p>
        <small style="color:#cbd5e1;"><b>AI Triage Breakdown:</b> ${esc(r.priority_reason || 'Standard priority scoring')}</small>
      </div>

      <!-- Quick Action Buttons -->
      <label style="font-size:12px;font-weight:700;color:#94a3b8;display:block;margin-bottom:6px;">UPDATE INCIDENT WORKFLOW STATUS</label>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:6px;margin-bottom:16px;">
        <button class="btn-action-secondary" style="font-size:11px;padding:6px 8px;" onclick="applyQuickStatus('Acknowledged')">✓ Acknowledge</button>
        <button class="btn-action-secondary" style="font-size:11px;padding:6px 8px;" onclick="applyQuickStatus('In Progress')">⚡ Start Action</button>
        <button class="btn-action-secondary" style="font-size:11px;padding:6px 8px;" onclick="applyQuickStatus('Action Taken')">🛡 Action Taken</button>
        <button class="btn-action-secondary" style="font-size:11px;padding:6px 8px;" onclick="applyQuickStatus('Finished')">🏁 Finished</button>
        <button class="btn-action-primary" style="font-size:11px;padding:6px 8px;" onclick="applyQuickStatus('Resolved Successfully')">★ Mark Resolved</button>
        <button class="btn-action-secondary" style="font-size:11px;padding:6px 8px;color:#f87171;border-color:#f87171;" onclick="applyQuickStatus('Unable to Resolve – Escalated')">⚠️ Escalate</button>
      </div>

      <!-- Reply Directly to Citizen -->
      <div class="form-group">
        <label>Official Reply / Action Update to Citizen</label>
        <div style="display:flex;gap:6px;">
          <input type="text" id="actionReplyInput" placeholder="Message to citizen (e.g. Squad dispatched with rubber boats)..." style="flex:1;">
          <button class="btn-action-primary" onclick="submitOfficialReply()">Send Reply</button>
        </div>
      </div>

      <!-- Manual Priority Override -->
      <div style="background:rgba(15,23,42,0.7);padding:10px;border-radius:8px;margin-top:12px;">
        <label style="font-size:11px;font-weight:700;color:#94a3b8;display:block;margin-bottom:4px;">MANUAL PRIORITY OVERRIDE</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="overrideLevelSelect" style="background:#081122;color:white;border:1px solid #334155;border-radius:4px;padding:4px;font-size:11px;">
            <option value="CRITICAL">CRITICAL (90%)</option>
            <option value="HIGH">HIGH (75%)</option>
            <option value="MEDIUM">MEDIUM (50%)</option>
            <option value="LOW">LOW (20%)</option>
          </select>
          <input type="text" id="overrideReasonInput" placeholder="Justification for override..." style="flex:1;font-size:11px;padding:4px 8px;">
          <button class="btn-action-secondary" style="font-size:11px;padding:4px 8px;" onclick="submitPriorityOverride()">Apply</button>
        </div>
      </div>

      <!-- Action Log & Replies Thread -->
      <div style="margin-top:16px;">
        <label style="font-size:12px;font-weight:700;color:#94a3b8;display:block;margin-bottom:6px;">AUDIT LOG & COMMUNICATION HISTORY</label>
        <div style="max-height:160px;overflow-y:auto;background:rgba(8,17,34,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px;font-size:12px;">
          ${history.map(h => `
            <div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
              <span class="text-cyan font-mono">${h.created_at ? h.created_at.slice(11, 19) : ''}</span> · 
              <b>${esc(h.new_status)}</b> by ${esc(h.updated_by_name)}: 
              <span style="color:#cbd5e1;">${esc(h.message)}</span>
            </div>
          `).join("")}
          ${replies.map(rep => `
            <div style="padding:4px 0;color:#38bdf8;">
              ✉ <b>Reply from ${esc(rep.sender_name)}:</b> "${esc(rep.message)}"
            </div>
          `).join("")}
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    content.innerHTML = `<div style="color:#ef4444;padding:16px;">Failed to load incident detail: ${esc(err.message)}</div>`;
  }
}

function closeActionModal() {
  $("incidentActionModal").classList.add("hidden");
  activeActionReportId = null;
}

async function applyQuickStatus(newStatus) {
  if (!activeActionReportId) return;
  try {
    await api(`/api/reports/${activeActionReportId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        message: `Field commander updated status to '${newStatus}'`
      })
    });
    toast(`✓ Report #${activeActionReportId} transitioned to ${newStatus}`);
    openActionModal(activeActionReportId);
    if (currentUser.role === "rescue") loadRescueViewData();
    if (currentUser.role === "collector") loadCollectorViewData();
    loadCitizenReports();
  } catch (err) {
    toast("Status error: " + err.message);
  }
}

async function submitOfficialReply() {
  const input = $("actionReplyInput");
  if (!input || !activeActionReportId) return;
  const msg = input.value.trim();
  if (msg.length < 2) return toast("Enter a reply message.");

  try {
    await api(`/api/reports/${activeActionReportId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    });
    input.value = "";
    toast("✓ Official reply logged and dispatched to citizen.");
    openActionModal(activeActionReportId);
    loadNotifications();
  } catch (err) {
    toast("Reply error: " + err.message);
  }
}

async function submitPriorityOverride() {
  const lvl = $("overrideLevelSelect").value;
  const reason = $("overrideReasonInput").value.trim();
  if (reason.length < 4) return toast("Please enter a justification for the priority override.");

  const scores = { "CRITICAL": 90, "HIGH": 75, "MEDIUM": 50, "LOW": 20 };
  try {
    await api(`/api/reports/${activeActionReportId}/override-priority`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priority_level: lvl,
        priority_score: scores[lvl],
        override_reason: reason
      })
    });
    toast(`✓ Priority overridden to ${lvl}`);
    openActionModal(activeActionReportId);
    if (currentUser.role === "rescue") loadRescueViewData();
    if (currentUser.role === "collector") loadCollectorViewData();
  } catch (err) {
    toast("Override error: " + err.message);
  }
}

function viewReportHistoryDetail(reportId) {
  openActionModal(reportId);
}

// ==============================================================
// 8. HISTORICAL DISASTER RECORDS (PARTS 6, 7, 8)
// ==============================================================
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
    if ($("landslideCountBadge")) $("landslideCountBadge").textContent = `${data.count} Verified Records`;

    if (!data.records.length) {
      list.innerHTML = `<p style="padding:16px;color:#94a3b8;font-size:12px;">No verified landslide records available for this district and period.</p>`;
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
  const yr = $("flYearFilter") ? $("flYearFilter").value : "all";
  const q = $("flSearchQuery") ? $("flSearchQuery").value.trim() : "";
  try {
    const params = new URLSearchParams();
    if (dist && dist !== "all") params.append("district", dist);
    if (yr && yr !== "all") params.append("year", yr);
    if (q) params.append("q", q);

    const data = await api(`/api/events/floods?${params.toString()}`);
    const list = $("floodList");
    if ($("floodCountBadge")) $("floodCountBadge").textContent = `${data.count} Verified Records`;

    if (!data.records.length) {
      list.innerHTML = `<p style="padding:16px;color:#94a3b8;font-size:12px;">No verified flood records available for this district and period.</p>`;
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

// DATA COVERAGE MODAL (PART 8)
async function openCoverageModal() {
  const modal = $("coverageModal");
  const content = $("coverageModalContent");
  if (!modal || !content) return;
  modal.classList.remove("hidden");
  content.innerHTML = `<div style="text-align:center;padding:16px;color:#94a3b8;">Loading data coverage statistics...</div>`;

  try {
    const res = await api("/api/events/coverage");
    content.innerHTML = `
      <div style="margin-bottom:14px;">
        <h4 style="color:#38bdf8;margin-bottom:4px;">Official Verified Disaster Incident Registry</h4>
        <p style="color:#cbd5e1;font-size:12px;">Archive covers verified government publications (GSI, CWC, TNSDMA, Revenue Dept) across all 38 Tamil Nadu districts & Puducherry from 2008 to 2026.</p>
      </div>
      <div class="two-col-layout">
        <div>
          <strong style="display:block;margin-bottom:6px;color:#f87171;">District Flood Incidents:</strong>
          <ul style="list-style:none;padding:0;">
            ${Object.entries(res.district_flood_counts || {}).map(([d, c]) => `
              <li style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                <span>${esc(d)}</span><b class="font-mono text-cyan">${c}</b>
              </li>
            `).join("")}
          </ul>
        </div>
        <div>
          <strong style="display:block;margin-bottom:6px;color:#fb923c;">District Landslide Incidents:</strong>
          <ul style="list-style:none;padding:0;">
            ${Object.entries(res.district_landslide_counts || {}).map(([d, c]) => `
              <li style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                <span>${esc(d)}</span><b class="font-mono text-cyan">${c}</b>
              </li>
            `).join("")}
          </ul>
        </div>
      </div>
      <div style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.1);padding-top:10px;">
        <strong style="color:#34d399;">Year-wise Historical Spread (2008–2026):</strong>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
          ${Object.entries(res.year_flood_counts || {}).map(([yr, cnt]) => `
            <span class="badge-tag font-mono">${yr}: ${cnt} Floods</span>
          `).join("")}
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div style="color:#ef4444;padding:16px;">Failed to load coverage: ${esc(err.message)}</div>`;
  }
}

function closeCoverageModal() {
  $("coverageModal").classList.add("hidden");
}

// ==============================================================
// 9. LEAFLET INTERACTIVE MAP (PART 23)
// ==============================================================
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

    if (currentMapFilter === "all" || currentMapFilter === "shelters") {
      (data.shelters || []).forEach(s => {
        const icon = L.divIcon({
          className: "custom-leaflet-marker",
          html: `<div style="background:#10b981;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:white;font-size:12px;border:2px solid white;">⌂</div>`,
          iconSize: [22, 22]
        });
        L.marker([s.latitude, s.longitude], { icon }).addTo(mapMarkersLayer)
          .bindPopup(`<b>${esc(s.name)}</b><br>Type: ${esc(s.facility_type)}<br>Capacity: <b>${s.occupancy}/${s.capacity}</b><br>Officer: ${esc(s.contact_officer || 'Tahsildar')} (${esc(s.phone || 'DEOC')})`);
      });
    }

    if (currentMapFilter === "all" || currentMapFilter === "landslides") {
      (data.landslides || []).forEach(l => {
        const icon = L.divIcon({
          className: "custom-leaflet-marker",
          html: `<div style="background:#d97706;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:white;font-size:12px;border:2px solid white;">▲</div>`,
          iconSize: [22, 22]
        });
        L.marker([l.latitude, l.longitude], { icon }).addTo(mapMarkersLayer)
          .bindPopup(`<b>Landslide: ${esc(l.location)}</b><br>Date: ${l.event_date}<br>${esc(l.description)}<br>Status: <i>${esc(l.verification_status)}</i>`);
      });
    }

    if (currentMapFilter === "all" || currentMapFilter === "floods") {
      (data.floods || []).forEach(f => {
        const icon = L.divIcon({
          className: "custom-leaflet-marker",
          html: `<div style="background:#3b82f6;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:white;font-size:12px;border:2px solid white;">≋</div>`,
          iconSize: [22, 22]
        });
        L.marker([f.latitude, f.longitude], { icon }).addTo(mapMarkersLayer)
          .bindPopup(`<b>Flood: ${esc(f.location)}</b><br>Date: ${f.event_date}<br>Water Depth: ${f.water_level_m}m<br>${esc(f.description)}`);
      });
    }

    if (currentMapFilter === "all" || currentMapFilter === "reports") {
      (data.emergency_reports || []).forEach(rep => {
        const icon = L.divIcon({
          className: "custom-leaflet-marker",
          html: `<div style="background:#ef4444;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:white;font-size:12px;border:2px solid white;animation:pulse 1.5s infinite;">!</div>`,
          iconSize: [22, 22]
        });
        L.marker([rep.latitude, rep.longitude], { icon }).addTo(mapMarkersLayer)
          .bindPopup(`<b>Incident #${rep.id} [${rep.priority_level}]</b><br>Type: ${esc(rep.report_type)}<br>Reporter: ${esc(rep.reporter_name)} (${esc(rep.phone)})<br>Status: <b>${esc(rep.status)}</b><br>${esc(rep.details)}`);
      });
    }
  } catch (err) {
    console.error("Map markers load error:", err);
  }
}

// ==============================================================
// 10. INCIDENT REPORTING MODAL & SUBMISSION (PART 10)
// ==============================================================
function openReportModal() {
  $("reportModal").classList.remove("hidden");
  if ($("repDistrictSelect")) $("repDistrictSelect").value = selected.district;
}
function closeReportModal() {
  $("reportModal").classList.add("hidden");
}

async function handleReportSubmit(e) {
  e.preventDefault();
  const reporter_name = $("repName").value.trim();
  const phone = $("repPhone").value.trim();
  const email = $("repEmail").value.trim();
  const report_type = $("repType").value;
  const district = $("repDistrictSelect").value || selected.district;
  const town_village = $("repTown").value.trim();
  const location_name = $("repLocation").value.trim();
  const details = $("repDetails").value.trim();

  try {
    const res = await api("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reporter_name,
        phone,
        email,
        latitude: selected.lat + (Math.random() - 0.5) * 0.02,
        longitude: selected.lon + (Math.random() - 0.5) * 0.02,
        location_name,
        district,
        town_village,
        full_address: location_name,
        report_type,
        details
      })
    });
    closeReportModal();
    toast(`🚨 Incident #${res.report_id} triaged as ${res.priority_level} (${res.priority_score}%). Dispatched to Rescue Command.`);
    loadCitizenReports();
    loadMapMarkers();
    loadNotifications();
  } catch (err) {
    toast("Report Error: " + err.message);
  }
}

// ==============================================================
// 11. PERIOD RAINFALL & CLIMATE CHARTS (PART 3)
// ==============================================================
async function loadPeriodRainfallData() {
  try {
    const d = await api(`/api/historical/period?lat=${selected.lat}&lon=${selected.lon}&period=${currentPeriod}`);
    $("periodTotalRain").textContent = `${d.total_rainfall_mm} mm`;
    $("periodAvgRain").textContent = `${d.avg_rainfall_mm} mm/day`;
    $("periodMaxRainDay").textContent = `${d.max_rainfall_mm} mm`;
    $("periodMaxRainDate").textContent = d.max_rainfall_date || "None";
    $("periodRainyDays").textContent = `${d.rainy_days_count} Days`;

    renderPeriodDailyChart(d.chart || []);
  } catch (err) {
    console.error("Period rainfall error:", err);
  }

  loadMonthlyClimateChart();
}

function selectRainfallPeriod(periodKey) {
  currentPeriod = periodKey;
  document.querySelectorAll(".period-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.period === periodKey);
  });
  loadPeriodRainfallData();
}

async function selectHistoricalMonth(monthStr) {
  if (!monthStr) return;
  try {
    const d = await api(`/api/historical/period?lat=${selected.lat}&lon=${selected.lon}&month=${monthStr}`);
    $("periodTotalRain").textContent = `${d.total_rainfall_mm} mm`;
    $("periodAvgRain").textContent = `${d.avg_rainfall_mm} mm/day`;
    $("periodMaxRainDay").textContent = `${d.max_rainfall_mm} mm`;
    $("periodMaxRainDate").textContent = d.max_rainfall_date || "None";
    $("periodRainyDays").textContent = `${d.rainy_days_count} Days`;
    renderPeriodDailyChart(d.chart || []);
    toast(`Filtered to month: ${monthStr}`);
  } catch (err) {
    toast(err.message);
  }
}

async function applyCustomDateRange() {
  const s = $("historyStartDate").value;
  const e = $("historyEndDate").value;
  if (!s || !e) return toast("Please select both start and end dates.");
  try {
    const d = await api(`/api/historical/period?lat=${selected.lat}&lon=${selected.lon}&start_date=${s}&end_date=${e}`);
    $("periodTotalRain").textContent = `${d.total_rainfall_mm} mm`;
    $("periodAvgRain").textContent = `${d.avg_rainfall_mm} mm/day`;
    $("periodMaxRainDay").textContent = `${d.max_rainfall_mm} mm`;
    $("periodMaxRainDate").textContent = d.max_rainfall_date || "None";
    $("periodRainyDays").textContent = `${d.rainy_days_count} Days`;
    renderPeriodDailyChart(d.chart || []);
    toast(`Filtered to range: ${s} to ${e}`);
  } catch (err) {
    toast(err.message);
  }
}

function renderPeriodDailyChart(dataPoints) {
  const ctx = $("periodDailyChart");
  if (!ctx) return;
  if (periodDailyChart) periodDailyChart.destroy();

  periodDailyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dataPoints.map(p => p.date),
      datasets: [{
        label: "Rainfall (mm)",
        data: dataPoints.map(p => p.rainfall_mm),
        backgroundColor: "rgba(56, 189, 248, 0.75)",
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
        x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.06)" } }
      }
    }
  });
}

async function loadMonthlyClimateChart() {
  const ctx = $("monthlyComparisonChart");
  if (!ctx) return;
  try {
    const res = await api(`/api/historical/monthly?lat=${selected.lat}&lon=${selected.lon}&years=2`);
    const monthly = res.monthly || [];
    if (monthlyComparisonChart) monthlyComparisonChart.destroy();

    monthlyComparisonChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: monthly.map(m => m.month),
        datasets: [{
          label: "NASA POWER Monthly Precipitation (mm)",
          data: monthly.map(m => m.rainfall_mm),
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
          x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.05)" } }
        }
      }
    });
  } catch (err) {
    console.error("Monthly chart error:", err);
  }
}

// ==============================================================
// 12. FAMILY CONTACTS, REVIEWS, NOTIFICATIONS & ALERTS
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
        <div class="fam-meta">✉ ${esc(c.email || 'No email registered')}</div>
        <div class="fam-meta">📍 ${esc(c.location || 'Tamil Nadu Sector')}</div>
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
    toast("Family contact removed.");
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
        custom_message: `Heavy rainfall indicators are present near your saved location (${selected.name}). Please monitor official weather updates and stay alert.`,
        lat: selected.lat,
        lon: selected.lon
      })
    });
    toast(`✓ Weather safety advisory dispatched to ${name}.`);
    loadNotifications();
  } catch (err) {
    toast(err.message);
  }
}

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
          <small>${n.created_at ? n.created_at.slice(0, 16).replace('T', ' ') : 'Just now'}</small>
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

async function loadGlobalAlerts() {
  try {
    const data = await api("/api/collector/overview");
    const banner = $("globalAlertBanner");
    if (!banner) return;
    const active = (data.alerts || []).filter(a => a.is_active !== 0);
    if (!active.length) {
      banner.innerHTML = "";
      return;
    }
    banner.innerHTML = active.map(a => `
      <div class="alert-banner-item ${a.severity.toLowerCase()}">
        <i data-lucide="alert-triangle"></i>
        <span><strong>${esc(a.severity)} [${esc(a.target_districts)}]:</strong> ${esc(a.title)} — ${esc(a.message)}</span>
      </div>
    `).join("");
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Global alerts error:", err);
  }
}

// ==============================================================
// 13. COLLECTOR DIRECTIVES & CSV LOGISTICS (PARTS 17, 8, 20)
// ==============================================================
async function loadCollectorSheltersTable() {
  const tbody = $("collectorSheltersTableBody");
  if (!tbody) return;
  try {
    const res = await api("/api/shelters");
    const shelters = res.shelters || [];
    tbody.innerHTML = shelters.map(s => {
      const pct = s.occupancy_percentage || Math.round((s.occupancy / s.capacity) * 100);
      const isHigh = pct >= 85;
      return `
        <tr>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(s.district)} (${esc(s.town || s.district)})</td>
          <td class="font-mono">${s.capacity}</td>
          <td class="font-mono"><b>${s.occupancy}</b></td>
          <td class="font-mono text-emerald"><b>${s.available_capacity}</b></td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="background:#1e293b;width:60px;height:6px;border-radius:3px;overflow:hidden;">
                <div style="background:${isHigh ? '#ef4444' : '#10b981'};width:${Math.min(100, pct)}%;height:100%;"></div>
              </div>
              <small class="font-mono">${pct}%</small>
            </div>
          </td>
          <td><small>${esc(s.contact_officer || 'Tahsildar')}<br><span class="font-mono text-cyan">📞 ${esc(s.phone || 'DEOC')}</span></small></td>
          <td><span class="risk-badge ${s.status === 'OPEN' ? 'low' : (s.status === 'FULL' ? 'critical' : 'moderate')}">${esc(s.status)}</span></td>
          <td>
            <div style="display:flex;gap:4px;">
              <input type="number" id="occ-input-${s.id}" value="${s.occupancy}" min="0" max="${s.capacity}" style="width:60px;background:#081122;color:white;border:1px solid #334155;border-radius:4px;padding:2px 4px;font-size:11px;">
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
    toast(`✓ Shelter updated: ${res.occupancy}/${res.capacity} (${res.utilization_pct}%)`);
    loadCollectorViewData();
    loadCollectorSheltersTable();
  } catch (err) {
    toast("Shelter update failed: " + err.message);
  }
}

function renderCollectorAlertsList(alerts = []) {
  const el = $("collectorAlertsList");
  if (!el) return;
  if (!alerts.length) {
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
  if (!confirm("Revoke this emergency broadcast directive?")) return;
  try {
    await api(`/api/collector/alerts/${alertId}`, { method: "DELETE" });
    toast("✓ Directive revoked.");
    loadCollectorViewData();
    loadGlobalAlerts();
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
    toast("🔴 Public directive published across all citizen portals!");
    $("bcastTitle").value = "";
    $("bcastMessage").value = "";
    loadCollectorViewData();
    loadGlobalAlerts();
  } catch (err) {
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

function downloadSampleCSVTemplate() {
  const sampleCSV = `incident_id,event_date,latitude,longitude,location,district,town_village,description,impact_details,source,source_url,type
FL-2024-VPM-03,2024-12-02,11.9401,79.4861,Viluppuram East Municipal Wards,Viluppuram,Viluppuram,Varahanadhi River Causeway Submergence,120 families evacuated to higher secondary school,Central Water Commission,https://cwc.gov.in,flood
LS-2024-NIL-04,2024-07-31,11.3530,76.7959,Coonoor Ghat Road KM 12,Nilgiris,Coonoor,Road cut mudslide blocking arterial freight lane,Single lane traffic clearance in 4 hours,Geological Survey of India,https://www.gsi.gov.in,landslide`;

  const blob = new Blob([sampleCSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "astroguard_verified_disaster_records_template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("✓ Sample CSV template downloaded.");
}

async function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  $("csvUploadStatus").textContent = "Uploading & validating records...";

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

async function exportIncidentReports() {
  try {
    toast("Generating official DEOC reports CSV...");
    const url = (API_BASE || "") + "/api/collector/export?token=" + encodeURIComponent(token || "");
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
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
    toast("✓ Incident reports CSV export ready.");
  } catch (err) {
    toast("Export error: " + err.message);
  }
}

// Tactical Map for Rescue Command
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

    reports.forEach(r => {
      const lat = Number(r.latitude) || (selected.lat + (Math.random() - 0.5) * 0.05);
      const lon = Number(r.longitude) || (selected.lon + (Math.random() - 0.5) * 0.05);
      const isCrit = (r.priority_level || "").toUpperCase() === "CRITICAL" || (r.priority_level || "").toUpperCase() === "HIGH";
      const pinColor = r.status === "Resolved Successfully" ? "#10b981" : (isCrit ? "#ef4444" : "#f59e0b");

      const pinHtml = `<div style="background:${pinColor};width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px ${pinColor};display:grid;place-items:center;color:white;font-size:10px;font-weight:bold;">!</div>`;
      const pinIcon = L.divIcon({ html: pinHtml, className: "custom-sos-pin", iconSize: [18, 18], iconAnchor: [9, 9] });

      const marker = L.marker([lat, lon], { icon: pinIcon });
      marker.bindPopup(`
        <div style="color:#0f172a;min-width:180px;font-family:sans-serif;">
          <strong style="color:#b91c1c;">⚠️ #${r.id} ${esc(r.report_type)} [${esc(r.priority_level)}]</strong><br>
          <small><b>Reporter:</b> ${esc(r.reporter_name)} (${esc(r.phone)})</small><br>
          <small><b>Location:</b> ${esc(r.location_name)}</small><br>
          <small><b>Status:</b> <b style="color:${pinColor}">${esc(r.status)}</b></small><br>
          <div style="margin-top:8px;">
            <button onclick="openActionModal(${r.id})" style="background:#0284c7;color:white;border:0;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;">Action & Dispatch</button>
          </div>
        </div>
      `);
      rescueTacticalLayer.addLayer(marker);
    });

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

// Live Background Synchronizer (Part 16)
async function syncLiveUpdates() {
  if (!currentUser) return;
  try {
    loadNotifications();
    loadGlobalAlerts();
    if (currentUser.role === "public") {
      loadCitizenReports();
    } else if (currentUser.role === "rescue") {
      const data = await api("/api/rescue/overview");
      cachedRescueReports = data.reports || [];
      renderRescueTriageTable(cachedRescueReports);
    } else if (currentUser.role === "collector") {
      const data = await api("/api/collector/overview");
      cachedRescueReports = data.reports || [];
      renderCollectorTriageTable(cachedRescueReports);
    }
  } catch { }
}

// ==============================================================
// 14. ATMOSPHERIC WEATHER CANVAS ENGINE
// ==============================================================
(function initAtmosphereCanvas() {
  const canvas = $("weatherAtmosphereCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const drops = Array.from({ length: 90 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    len: 12 + Math.random() * 16,
    speed: 14 + Math.random() * 12,
    opacity: 0.25 + Math.random() * 0.45
  }));

  const clouds = Array.from({ length: 6 }, (_, i) => ({
    x: (i * (width / 5)) - 100,
    y: 20 + Math.random() * 140,
    radius: 120 + Math.random() * 90,
    speed: 0.25 + Math.random() * 0.35,
    opacity: 0.12 + Math.random() * 0.15
  }));

  function loop() {
    ctx.clearRect(0, 0, width, height);

    // Drifting Volumetric Clouds
    clouds.forEach(c => {
      c.x += c.speed;
      if (c.x - c.radius > width) c.x = -c.radius * 2;
      const grad = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, c.radius);
      grad.addColorStop(0, `rgba(224, 242, 254, ${c.opacity})`);
      grad.addColorStop(0.5, `rgba(186, 230, 253, ${c.opacity * 0.6})`);
      grad.addColorStop(1, "rgba(224, 242, 254, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Falling Raindrops
    ctx.strokeStyle = "rgba(186, 230, 253, 0.45)";
    ctx.lineWidth = 1.2;
    drops.forEach(d => {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 2, d.y + d.len);
      ctx.stroke();

      d.y += d.speed;
      d.x -= 1.2;
      if (d.y > height) {
        d.y = -20;
        d.x = Math.random() * width;
      }
    });

    requestAnimationFrame(loop);
  }
  loop();
})();

// Document Ready Bootstrap
document.addEventListener("DOMContentLoaded", initSession);
