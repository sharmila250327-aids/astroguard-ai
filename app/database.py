import os, sqlite3, shutil
from pathlib import Path
from pwdlib import PasswordHash

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "astroguard.db"

# Serverless environment handling (e.g. Vercel read-only filesystem)
if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    tmp_db = Path("/tmp/astroguard.db")
    if not tmp_db.exists() and DEFAULT_DB_PATH.exists():
        try:
            shutil.copyfile(DEFAULT_DB_PATH, tmp_db)
        except Exception:
            pass
    DB_PATH = os.getenv("DATABASE_PATH", str(tmp_db))
else:
    DB_PATH = os.getenv("DATABASE_PATH", str(DEFAULT_DB_PATH))

password_hash = PasswordHash.recommended()

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True) if os.path.dirname(DB_PATH) else None
    with connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'public', -- 'public', 'rescue', 'collector'
          is_verified INTEGER DEFAULT 1,
          department TEXT DEFAULT '',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS family_contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          relationship TEXT NOT NULL, -- 'Father', 'Mother', 'Brother', 'Sister', 'Friend', 'Emergency Contact'
          phone TEXT NOT NULL,
          email TEXT DEFAULT '',
          location TEXT DEFAULT '',
          notifications_enabled INTEGER DEFAULT 1,
          status TEXT DEFAULT 'SAFE',
          last_checkin TEXT DEFAULT CURRENT_TIMESTAMP,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS landslide_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_date TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          location TEXT NOT NULL,
          district TEXT NOT NULL,
          description TEXT NOT NULL,
          source TEXT NOT NULL,
          verification_status TEXT NOT NULL DEFAULT 'SAMPLE DATA', -- 'VERIFIED', 'SAMPLE DATA'
          notes TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS flood_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_date TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          location TEXT NOT NULL,
          district TEXT NOT NULL,
          description TEXT NOT NULL,
          source TEXT NOT NULL,
          verification_status TEXT NOT NULL DEFAULT 'SAMPLE DATA', -- 'VERIFIED', 'SAMPLE DATA'
          water_level_m REAL DEFAULT 0,
          notes TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS emergency_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          reporter_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          location_name TEXT NOT NULL,
          district TEXT DEFAULT '',
          report_type TEXT NOT NULL, -- 'Flood Inundation', 'Landslide / Mudslide', 'Road Blocked', 'Medical Rescue', 'Structure Collapse'
          severity TEXT NOT NULL DEFAULT 'HIGH', -- 'CRITICAL', 'HIGH', 'MODERATE', 'LOW'
          status TEXT NOT NULL DEFAULT 'NEW', -- 'NEW', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'IN_PROGRESS', 'RESOLVED'
          assigned_unit TEXT DEFAULT 'Unassigned',
          details TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS user_reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          user_name TEXT NOT NULL,
          rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          role TEXT DEFAULT 'public', -- 'public', 'rescue', 'collector', 'all'
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          type TEXT DEFAULT 'rainfall_alert', -- 'rainfall_alert', 'risk_alert', 'reminder', 'report_update', 'admin'
          severity TEXT DEFAULT 'info', -- 'high', 'moderate', 'info'
          read_status INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          severity TEXT NOT NULL, -- 'RED_ALERT', 'ORANGE_ALERT', 'YELLOW_WATCH'
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          target_districts TEXT NOT NULL,
          issued_by TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rescue_units (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          unit_code TEXT UNIQUE NOT NULL,
          team_name TEXT NOT NULL,
          unit_type TEXT NOT NULL,
          personnel INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'READY', -- 'READY', 'DEPLOYED', 'ON_SCENE', 'STANDBY'
          assigned_task TEXT DEFAULT 'Standby',
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          equipment TEXT
        );

        CREATE TABLE IF NOT EXISTS shelters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          facility_type TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          district TEXT NOT NULL,
          capacity INTEGER NOT NULL,
          occupancy INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'NEAR_CAPACITY', 'FULL'
          contact_officer TEXT,
          phone TEXT,
          supplies_status TEXT DEFAULT 'ADEQUATE'
        );

        CREATE TABLE IF NOT EXISTS official_contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          department TEXT NOT NULL,
          designation TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL,
          district TEXT NOT NULL,
          is_verified INTEGER DEFAULT 1
        );
        """)

        # Seed pre-configured demo users
        users = [
            ("Public Citizen Demo", "public@astroguard.ai", password_hash.hash("DemoPublic123!"), "public", 1, "Citizen Community"),
            ("NDRF Rescue Coordinator", "rescue@astroguard.ai", password_hash.hash("DemoRescue123!"), "rescue", 1, "National Disaster Response Force (NDRF)"),
            ("District Collector & Magistrate", "collector@district.gov.in", password_hash.hash("DemoAdmin123!"), "collector", 1, "District Emergency Operations Center (DEOC)")
        ]
        for u in users:
            c.execute("""
            INSERT INTO users (name, email, password_hash, role, is_verified, department)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
            password_hash=excluded.password_hash,
            role=excluded.role,
            is_verified=excluded.is_verified,
            department=excluded.department
            """, u)

        # Seed Landslide Records (clearly labeled)
        l_count = c.execute("SELECT COUNT(*) n FROM landslide_events").fetchone()["n"]
        if l_count == 0:
            c.executemany("""
            INSERT INTO landslide_events (event_date, latitude, longitude, location, district, description, source, verification_status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                ("2024-07-28", 11.9401, 79.4861, "Viluppuram-Gingee Foothill Road", "Viluppuram", "Minor embankment mudslide triggered by prolonged monsoon shower; culvert clearing deployed.", "State Highway Authority Survey", "SAMPLE DATA", "Low soil cohesion on unprotected road cut."),
                ("2023-11-18", 11.9360, 79.4920, "Gingee Fort Approach Slope", "Viluppuram", "Rock and earth debris slide across fort peripheral path following 110mm rainfall.", "District Disaster Records", "SAMPLE DATA", "Steep granite slope runoff with loose boulders."),
                ("2024-08-14", 11.4102, 76.6950, "Ooty-Kotagiri Mountain Pass KM 14", "Nilgiris", "Major landslide blocking two arterial traffic lanes after 230mm heavy rainfall.", "Geological Survey of India (GSI)", "VERIFIED", "Slope failure in weathered charnockite overburden."),
                ("2023-12-05", 12.9249, 80.1000, "Tambaram Overpass Cut Slope", "Chengalpattu", "Mud embankment slump onto bypass drainage channel during Cyclone Michaung.", "State Disaster Management Registry", "VERIFIED", "Saturated landfill bank collapse.")
            ])

        # Seed Flood Records (clearly labeled)
        f_count = c.execute("SELECT COUNT(*) n FROM flood_events").fetchone()["n"]
        if f_count == 0:
            c.executemany("""
            INSERT INTO flood_events (event_date, latitude, longitude, location, district, description, source, verification_status, water_level_m, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                ("2023-12-04", 11.9401, 79.4861, "Viluppuram East Municipal Colony", "Viluppuram", "Waterlogging up to 1.5 ft in low-lying residential wards after 145mm torrential rainfall.", "District Revenue Office", "SAMPLE DATA", 0.45, "Urban stormwater drainage overflow."),
                ("2024-10-15", 11.9520, 79.5100, "Thenpennai River Low Causeway", "Viluppuram", "Causeway submerged by 2.2 ft river runoff from upstream reservoir discharge.", "Public Works Dept (Water Resources)", "SAMPLE DATA", 0.70, "Traffic diverted to high bridge."),
                ("2023-12-04", 13.0012, 80.2241, "Velachery Lake Overflow Basin", "Chennai", "Severe urban inundation exceeding 4 feet depth during Cyclone Michaung landfall.", "TN State Disaster Management Authority", "VERIFIED", 1.25, "Submerged ground floor apartments; boat rescue deployed."),
                ("2021-11-11", 11.7500, 79.7500, "Cuddalore Coastal Delta Settlements", "Cuddalore", "Flash flood surge in low elevation river mouth villages following depression.", "Central Water Commission (CWC)", "VERIFIED", 0.90, "Over 1,200 residents moved to relief shelters.")
            ])

        # Seed Emergency Reports
        e_count = c.execute("SELECT COUNT(*) n FROM emergency_reports").fetchone()["n"]
        if e_count == 0:
            c.executemany("""
            INSERT INTO emergency_reports (reporter_name, phone, latitude, longitude, location_name, district, report_type, severity, status, assigned_unit, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                ("Ramesh Sundaram", "+91 98401 33219", 11.9401, 79.4861, "Viluppuram Bus Stand Area Low Ward", "Viluppuram", "Flood Inundation", "HIGH", "ACKNOWLEDGED", "Rescue Unit V-1", "Water entered ground floor shops and residences; 6 persons requesting safety assistance."),
                ("Kavitha M.", "+91 97908 44102", 11.9600, 79.4700, "Gingee Bypass Link Road", "Viluppuram", "Road Blocked", "MODERATE", "NEW", "Unassigned", "Uprooted tamarind tree and water overflow blocking tractor and ambulance passage."),
                ("V. Anand", "+91 94441 55678", 13.0034, 80.2189, "Velachery Vijayanagar 4th Cross", "Chennai", "Medical Rescue", "CRITICAL", "TEAM_ASSIGNED", "NDRF-04", "Elderly diabetic patient trapped on terrace due to 3.5 ft water stagnation; needs extraction."),
                ("Deepa R.", "+91 98845 77661", 12.9341, 80.1190, "Mudichur Riverbed Causeway", "Chengalpattu", "Flood Inundation", "HIGH", "RESOLVED", "SDRF-02", "14 residents evacuated safely to Corporation Higher Secondary School shelter.")
            ])

        # Seed Rescue Units
        r_count = c.execute("SELECT COUNT(*) n FROM rescue_units").fetchone()["n"]
        if r_count == 0:
            c.executemany("""
            INSERT INTO rescue_units (unit_code, team_name, unit_type, personnel, status, assigned_task, lat, lon, equipment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                ("NDRF-04", "4th NDRF Battalion Team Alpha", "Swiftwater Flood Rescue", 16, "DEPLOYED", "Sector 3 Inundation Relief", 13.0827, 80.2707, "4 Inflatable Boats, 12 Life Buoys, Satellite Transceiver"),
                ("SDRF-V1", "Viluppuram SDRF Rapid Response Team", "Urban Flood & Evac", 14, "READY", "Viluppuram Fire HQ Standby", 11.9401, 79.4861, "3 Rubber Rafts, Dewatering Pumps, Chain Saws"),
                ("SDRF-02", "State Disaster Response Unit Bravo", "Heavy Debris & Tree Clearance", 18, "READY", "Chengalpattu Standby Station", 12.9249, 80.1000, "Hydraulic Cutters, Winches, 4x4 Heavy Unimog"),
                ("COAST-G1", "Coast Guard Marine Rescue Squad", "Maritime Coastal Surge", 12, "READY", "Cuddalore Harbor Dock", 11.7500, 79.7500, "2 Fast Rescue Gemini Crafts, Night Vision Gear")
            ])

        # Seed Shelters
        s_count = c.execute("SELECT COUNT(*) n FROM shelters").fetchone()["n"]
        if s_count == 0:
            c.executemany("""
            INSERT INTO shelters (name, facility_type, latitude, longitude, district, capacity, occupancy, status, contact_officer, phone, supplies_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                ("Viluppuram Municipal Higher Secondary School", "Education Campus", 11.9425, 79.4880, "Viluppuram", 450, 180, "OPEN", "Tahsildar K. Saravanan", "+91 94441 55201", "ABUNDANT"),
                ("Gingee Community Welfare Center", "Civic Center", 12.2500, 79.4200, "Viluppuram", 300, 110, "OPEN", "Rev. Officer M. Thangaraj", "+91 94442 88310", "ADEQUATE"),
                ("St. Thomas Relief & Evacuation Center", "Indoor Multi-Sport Complex", 13.0067, 80.2014, "Chennai", 600, 420, "OPEN", "Capt. S. Ramanathan", "+91 94441 22301", "ABUNDANT"),
                ("Tambaram Corporation Relief Camp", "Community Hall", 12.9281, 80.1172, "Chengalpattu", 350, 310, "NEAR_CAPACITY", "Insp. P. Veerappan", "+91 94440 99120", "ADEQUATE")
            ])

        # Seed Official Contacts
        oc_count = c.execute("SELECT COUNT(*) n FROM official_contacts").fetchone()["n"]
        if oc_count == 0:
            c.executemany("""
            INSERT INTO official_contacts (name, department, designation, phone, email, district, is_verified)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, [
                ("Thiru. C. Palanisamy, IAS", "District Collectorate", "District Collector & District Magistrate", "+91 4146 222450", "collr-vpm@nic.in", "Viluppuram", 1),
                ("Dr. S. K. Narayanan", "Revenue & Disaster Management", "District Revenue Officer (DRO)", "+91 4146 222455", "dro-vpm@nic.in", "Viluppuram", 1),
                ("Er. K. Murugesan", "Public Works Department", "Executive Engineer (Water Resources)", "+91 4146 223100", "ee-pwd-vpm@tn.gov.in", "Viluppuram", 1),
                ("Thiru. R. Venkatesh", "Fire and Rescue Services", "District Fire Officer", "+91 4146 222101", "dfo-vpm@tn.gov.in", "Viluppuram", 1)
            ])

        # Seed Bulletins / Alerts
        a_count = c.execute("SELECT COUNT(*) n FROM alerts").fetchone()["n"]
        if a_count == 0:
            c.executemany("""
            INSERT INTO alerts (severity, title, message, target_districts, issued_by, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
            """, [
                ("ORANGE_ALERT", "Intense Monsoon Convective Rain Watch", "Doppler atmospheric models indicate localized heavy rainfall bands (65-115 mm) likely over northern coastal and interior taluks. Low-elevation residents advised to maintain alert readiness.", "Viluppuram, Cuddalore, Chengalpattu", "District Collector & DEOC"),
                ("YELLOW_WATCH", "Thenpennai River Inflow Advisory", "Sothupakkam & Sathanur dam upstream inflows elevated. Farmers and residents near riverbanks advised to refrain from crossing low causeways.", "Viluppuram, Tiruvannamalai", "Public Works Dept (Dam Safety Cell)"),
                ("RED_ALERT", "Flash Flood Watch for Coastal Low-Lying Wards", "Severe cyclonic bands triggering sustained precipitation in excess of 150mm. Emergency relief shelters operational 24/7.", "Chennai, Chengalpattu", "State Disaster Management Authority")
            ])

        # Seed Initial Notifications
        n_count = c.execute("SELECT COUNT(*) n FROM notifications").fetchone()["n"]
        if n_count == 0:
            c.executemany("""
            INSERT INTO notifications (role, title, message, type, severity, read_status)
            VALUES (?, ?, ?, ?, ?, 0)
            """, [
                ("public", "AstroGuard AI Weather Alert", "Elevated rainfall indicators detected in your selected area. Experimental rainfall risk screening: MODERATE. Follow official announcements.", "rainfall_alert", "high"),
                ("public", "Safety Checkpoint Reminder", "Review your family emergency contacts and confirm your local shelter address.", "reminder", "info"),
                ("rescue", "New Incident Dispatched: Viluppuram East", "Report #1 received: Waterlogging in low ward. Rescue unit assigned.", "report_update", "high"),
                ("collector", "District Rainfall Telemetry Updated", "NASA POWER & Open-Meteo telemetry refreshed for all 9 taluks.", "admin", "info")
            ])

        # Seed Initial User Reviews
        rev_count = c.execute("SELECT COUNT(*) n FROM user_reviews").fetchone()["n"]
        if rev_count == 0:
            c.executemany("""
            INSERT INTO user_reviews (user_name, rating, title, message)
            VALUES (?, ?, ?, ?)
            """, [
                ("Ananya Krishnan", 5, "Remarkable Rainfall Screening Accuracy", "The localized hourly rainfall and experimental risk indicator helped our colony prepare sandbags before the evening cloudburst."),
                ("Senthil Velan", 5, "Emergency Family Reminders are Invaluable", "Adding my parents in Gingee and sending them one-click weather alerts with shelter numbers gave our family complete peace of mind."),
                ("Dr. R. Prabhakaran", 4, "Clear Scientific Distinctions", "I appreciate that AstroGuard clearly explains these are experimental screening scores and distinguishes forecasts from NASA historical data.")
            ])

        # Seed demo family contacts for public user
        pub_user = c.execute("SELECT id FROM users WHERE email='public@astroguard.ai'").fetchone()
        if pub_user:
            fc_count = c.execute("SELECT COUNT(*) n FROM family_contacts WHERE user_id=?", (pub_user["id"],)).fetchone()["n"]
            if fc_count == 0:
                c.executemany("""
                INSERT INTO family_contacts (user_id, name, relationship, phone, email, location, notifications_enabled, status)
                VALUES (?, ?, ?, ?, ?, ?, 1, 'SAFE')
                """, [
                    (pub_user["id"], "K. Ramanathan", "Father", "+91 94432 11090", "ramanathan@example.com", "Viluppuram East"),
                    (pub_user["id"], "R. Meenakshi", "Mother", "+91 94432 11091", "meenakshi@example.com", "Viluppuram East"),
                    (pub_user["id"], "R. Karthik", "Brother", "+91 98401 55210", "karthik.r@example.com", "Chennai OMR")
                ])
