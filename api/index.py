import sys
import os
import shutil
from pathlib import Path

# Add repository root to Python path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Ensure database is writable in Vercel serverless environment
if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    tmp_db = Path("/tmp/astroguard.db")
    bundled_db = ROOT_DIR / "astroguard.db"
    if not tmp_db.exists() and bundled_db.exists():
        try:
            shutil.copyfile(bundled_db, tmp_db)
        except Exception:
            pass
    if tmp_db.exists():
        os.environ["DATABASE_PATH"] = str(tmp_db)

from app.main import app
