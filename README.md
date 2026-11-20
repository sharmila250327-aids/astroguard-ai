# ASTROGUARD AI — WEATHER & DISASTER RISK INTELLIGENCE PLATFORM

A mission-grade weather intelligence and disaster risk screening platform inspired by modern high-end weather applications. Features dark navy/charcoal glassmorphism, real atmospheric telemetry integrations (Open-Meteo & NASA POWER), three specialized role-based operational dashboards, and an interactive GIS spatial mapping suite.

---

## 🌐 Live System Link

* **Platform URL:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
* **Interactive API Documentation:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **ReDoc OpenAPI Documentation:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## 🔑 Pre-Configured Demo Accounts & Access

The login interface presents three distinct role cards with one-click instant demo access:

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **1. Public / Citizen** | `public@astroguard.ai` | `DemoPublic123!` | Public Weather, Risk, Map, Safer Areas, Family Network, Reports |
| **2. Rescue Team** | `rescue@astroguard.ai` | `DemoRescue123!` | Tactical Incident Triage Queue, Squad Units Dispatch, Rescue Manifest |
| **3. Collector / Municipality** | `collector@district.gov.in` | `DemoAdmin123!` | Executive DEOC, Public Alerts, Shelter Logistics, CSV Import/Export |

> **Note:** Each card on the login screen has a **"One-Click Demo Access"** button allowing immediate entry without manually typing credentials. Guest demo access is securely routed to each role's dedicated interface.

---

## 🌟 Key Features & Architecture

### 1. Unified Landing & Role Selection
* **Zero-Empty-Screen Architecture**: Beautiful dark glassmorphism landing screen with dynamic particle background and high-contrast typography.
* **Role-Based Access Control (RBAC)**: Strict JWT verification; public citizens cannot access Rescue Command or Collector DEOC endpoints (returns HTTP 403 Forbidden).

### 2. Public / Citizen Dashboard
* **Default Location**: Automatically centers on **Viluppuram, Tamil Nadu, India** (`11.9401°N, 79.4861°E`).
* **Live Weather Hero Card**: Real-time atmospheric metrics from Open-Meteo (Temperature, Apparent Temp, Weather Condition illustration, Current Precipitation, Humidity, Wind Speed, Pressure, and Soil Moisture estimate).
* **Horizontal Hourly Forecast Strip**: Interactive 24-hour strip displaying time, weather icon, temperature, rainfall volume, and rain probability.
* **7-Day Daily Forecast Grid**: Daily high/low temperatures, precipitation sums, rain probability, and weather condition badges.
* **Recent Weather History**: Last 3 days observed reanalysis rainfall and temperatures from Open-Meteo, clearly marked as gridded observations.
* **Date & Month Rainfall Analysis**: Multi-period filter (Today, Yesterday, Last 3 Days, Last 7 Days, Current Month, Previous Month) with dynamic Chart.js rainfall accumulation graphs.
* **Verified Landslide & Flood Records**: Historical disaster archives with filters for district and year/month, transparently labeled as `VERIFIED` or `SAMPLE DATA`.
* **Large Interactive Leaflet Map**:
  * Real OpenStreetMap / Carto tiles with auto-zoom on search.
  * Color-coded rainfall indicators: **RED** (High rainfall >20mm), **YELLOW** (Moderate rainfall 5-20mm), **GREEN** (Low rainfall <5mm).
  * Layer toggles: Rainfall Marker, Verified Landslides, Verified Floods, Evacuation Shelters, and Citizen Emergency Reports.
  * Location marker placement & browser GPS integration.
* **Location Safety Analysis (Dual Experimental Risk Screening)**:
  * **Experimental Flood Risk Screening** (0 to 100)
  * **Experimental Landslide Risk Screening** (0 to 100)
  * Detailed transparent calculation factors (24h/48h/72h rainfall, soil moisture, recorded historical incidents within 10 km).
  * Explicit disclaimer: *"Experimental Risk Score – Not a calibrated probability of an actual disaster."*
* **Safer Nearby Area Comparison**: Compares surrounding sectors (North, South, East, West Plateau) and highlights lower rainfall alternatives (*"Lower rainfall indicators – not a verified safe shelter"*).
* **Family Contacts & Weather Reminders**: Register family contacts and broadcast in-app weather advisories with one click.
* **Citizen Emergency Reports**: Log local hazards (Floods, Landslides, Road Blockages, Medical Rescues) with automatic coordinates.
* **Community Reviews & Testimonials**: Submit star ratings and feedback.

### 3. Rescue Team Command Grid
* **Live Tactical Triage Queue**: Pipeline tracking status: `NEW` ➔ `ACKNOWLEDGED` ➔ `TEAM_ASSIGNED` ➔ `IN_PROGRESS` ➔ `RESOLVED`.
* **Squad Unit Deployment**: Manage active rescue units (NDRF, SDRF, Marine Flood Extraction) with real-time personnel and equipment manifests.
* **Incident Action Logging**: Update incident statuses directly from the field queue.

### 4. Collector & Municipality DEOC
* **Executive Strategic Overview**: Total macro incident metrics, unresolved calls, and shelter capacity tracking.
* **Shelter Capacity Logistics**: Total bed capacity, current occupancy, and live utilization percentages.
* **Official Alerts Broadcaster**: Issue public alerts (`RED_ALERT`, `ORANGE_ALERT`, `YELLOW_WATCH`) targeted by district.
* **Data Management**: CSV import for verified historical incidents and CSV export for emergency reports.
* **Official Contacts Directory**: Verified DEOC officers, PWD engineers, and emergency helplines.

---

## 🛠️ Technology Stack

* **Backend Framework:** FastAPI (Python 3.13) with Uvicorn ASGI server
* **Database:** SQLite3 (`astroguard.db`) with relational integrity and indexing
* **Security & Auth:** Argon2 password hashing (`pwdlib`), JWT Bearer tokens (HS256)
* **Frontend:** Vanilla HTML5, CSS3 Glassmorphism design system, JavaScript ES6+
* **Icons:** Lucide Icons
* **Charts:** Chart.js 4.4
* **Spatial Mapping:** Leaflet 1.9.4 with custom SVG pulse markers
* **Meteorological Integrations:**
  * Open-Meteo High-Resolution Forecast & Current Weather API
  * Open-Meteo Geocoding Search Engine (with phonetic & spelling alias fallbacks)
  * Open-Meteo Archive / Reanalysis Historical API
  * NASA POWER Daily Earth Science Agroclimatology API

---

## 🚀 Running the Project

### Option 1: One-Click Windows Launcher
Double-click `run.bat` in the project root directory.

### Option 2: Command Line
```powershell
# Activate virtual environment
.\.venv\Scripts\activate.bat

# Launch Uvicorn server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in any modern browser.
