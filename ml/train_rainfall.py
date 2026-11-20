"""Train an educational next-day rainfall model using NASA POWER daily data.
Run: python ml/train_rainfall.py --lat 11.9401 --lon 79.4861 --years 5
"""
import argparse, os
from datetime import date, timedelta
import httpx, pandas as pd, joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

URL="https://power.larc.nasa.gov/api/temporal/daily/point"
FEATURES=["rain_lag1","rain_prev3_avg","rain_prev7_avg","month","temperature","humidity"]

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--lat",type=float,required=True); ap.add_argument("--lon",type=float,required=True)
    ap.add_argument("--years",type=int,default=5); ap.add_argument("--out",default="models/rainfall_model.joblib"); a=ap.parse_args()
    end=date.today()-timedelta(days=3); start=end-timedelta(days=365*max(2,min(a.years,5)))
    params={"parameters":"PRECTOTCORR,T2M,RH2M","community":"RE","longitude":a.lon,"latitude":a.lat,"start":start.strftime("%Y%m%d"),"end":end.strftime("%Y%m%d"),"format":"JSON"}
    print("Downloading NASA POWER daily history…")
    with httpx.Client(timeout=120) as client: r=client.get(URL,params=params); r.raise_for_status(); raw=r.json()
    p=raw.get("properties",{}).get("parameter",{}); rain=p.get("PRECTOTCORR",{}); temp=p.get("T2M",{}); hum=p.get("RH2M",{})
    df=pd.DataFrame({"date":pd.to_datetime(list(rain.keys()),format="%Y%m%d"),"rain":list(rain.values()),"temperature":list(temp.values()),"humidity":list(hum.values())}).sort_values("date")
    for c in ["rain","temperature","humidity"]: df[c]=pd.to_numeric(df[c],errors="coerce").where(lambda x:x>-900)
    df["month"]=df.date.dt.month; df["rain_lag1"]=df.rain.shift(1); df["rain_prev3_avg"]=df.rain.shift(1).rolling(3).mean(); df["rain_prev7_avg"]=df.rain.shift(1).rolling(7).mean(); df["target"]=df.rain
    df=df.dropna(subset=["target","rain_lag1","rain_prev3_avg","rain_prev7_avg"])
    if len(df)<300: raise SystemExit(f"Need at least 300 daily records; received {len(df)}")
    cut=int(len(df)*.8); train,test=df.iloc[:cut],df.iloc[cut:]
    model=Pipeline([("imputer",SimpleImputer(strategy="median")),("rf",RandomForestRegressor(n_estimators=180,max_depth=10,min_samples_leaf=3,random_state=42,n_jobs=-1))])
    model.fit(train[FEATURES],train.target); pred=model.predict(test[FEATURES]).clip(0)
    metrics={"mae_mm":float(mean_absolute_error(test.target,pred)),"rmse_mm":float(mean_squared_error(test.target,pred)**.5),"r2":float(r2_score(test.target,pred))}
    os.makedirs(os.path.dirname(a.out) or ".",exist_ok=True); joblib.dump({"model":model,"features":FEATURES,"metrics":metrics,"trained_at":date.today().isoformat(),"source":"NASA POWER gridded daily data"},a.out)
    print("Saved",a.out,"metrics",metrics); print("Experimental model only; not a calibrated landslide/flood predictor.")
if __name__=="__main__": main()
