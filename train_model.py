import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb
import joblib
import json
import warnings
warnings.filterwarnings("ignore")

# ─── 1. LOAD DATA ─────────────────────────────────────────────────────────────
print("Loading data...")
df = pd.read_csv("/mnt/user-data/outputs/synthetic_demand_data.csv")
print(f"Shape: {df.shape}")

# ─── 2. CREATE TARGET: next month's sales_qty ─────────────────────────────────
# Sort so we can shift within each product×location group
df = df.sort_values(["product_id", "location_id", "year", "month"]).reset_index(drop=True)

df["next_month_sales"] = (
    df.groupby(["product_id", "location_id"])["sales_qty"].shift(-1)
)

# Drop rows where target is NaN (last month per group has no next month)
df = df.dropna(subset=["next_month_sales"]).copy()
df["next_month_sales"] = df["next_month_sales"].astype(int)
print(f"After creating target: {df.shape}")

# ─── 3. FEATURE ENGINEERING ───────────────────────────────────────────────────
# Encode categoricals
le_cat      = LabelEncoder()
le_loc      = LabelEncoder()
le_loc_kind = LabelEncoder()
le_tier     = LabelEncoder()

df["category_enc"]     = le_cat.fit_transform(df["category"])
df["location_enc"]     = le_loc.fit_transform(df["location_id"])
df["loc_kind_enc"]     = le_loc_kind.fit_transform(df["location_kind"])
df["price_tier_enc"]   = le_tier.fit_transform(df["price_tier"])

# WMA baseline (weights 0.2, 0.3, 0.5 on lag3, lag2, lag1)
df["wma_prediction"] = (
    0.2 * df["prev_3month_sales"] +
    0.3 * df["prev_2month_sales"] +
    0.5 * df["prev_month_sales"]
)

FEATURES = [
    # Lag features
    "prev_month_sales", "prev_2month_sales", "prev_3month_sales",
    # Rolling averages
    "rolling_avg_3m", "rolling_avg_6m",
    # Trend
    "sales_trend",
    # Seasonal
    "month_sin", "month_cos", "is_winter", "is_summer", "month",
    # Stock / supply
    "stock_at_end", "stock_at_start", "incoming_qty", "stockout_flag",
    # Product features
    "price", "sale_price", "profit_margin", "avg_daily_sales",
    "category_enc", "price_tier_enc",
    # Location
    "location_enc", "loc_kind_enc",
    # Time
    "year", "days_in_month",
    # Current month sales (helps model see current demand level)
    "sales_qty",
]

TARGET = "next_month_sales"

X = df[FEATURES].copy()
X["is_winter"]    = X["is_winter"].astype(int)
X["is_summer"]    = X["is_summer"].astype(int)
X["stockout_flag"]= X["stockout_flag"].astype(int)
y = df[TARGET]

# ─── 4. TRAIN / TEST SPLIT (time-aware: last 3 months as test) ────────────────
cutoff = df[df["year"] * 100 + df["month"] >= 202601].index
if len(cutoff) < 100:
    # fallback to random split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=42)
    wma_test = df.loc[X_test.index, "wma_prediction"]
else:
    test_idx = cutoff
    train_idx = df[df["year"] * 100 + df["month"] < 202601].index
    X_train, X_test = X.loc[train_idx], X.loc[test_idx]
    y_train, y_test = y.loc[train_idx], y.loc[test_idx]
    wma_test = df.loc[test_idx, "wma_prediction"]

print(f"Train: {len(X_train):,}  |  Test: {len(X_test):,}")

# ─── 5. RANDOM FOREST BASELINE ────────────────────────────────────────────────
print("\nTraining Random Forest...")
rf = RandomForestRegressor(n_estimators=150, max_depth=12, min_samples_leaf=5,
                           n_jobs=-1, random_state=42)
rf.fit(X_train, y_train)
rf_preds = np.maximum(0, rf.predict(X_test))

rf_mae  = mean_absolute_error(y_test, rf_preds)
rf_rmse = np.sqrt(mean_squared_error(y_test, rf_preds))
rf_r2   = r2_score(y_test, rf_preds)

# ─── 6. XGBOOST ───────────────────────────────────────────────────────────────
print("Training XGBoost...")
xgb_model = xgb.XGBRegressor(
    n_estimators=400,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_weight=5,
    reg_alpha=0.1,
    reg_lambda=1.0,
    objective="reg:squarederror",
    random_state=42,
    n_jobs=-1,
    verbosity=0,
)
xgb_model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    verbose=False,
)
xgb_preds = np.maximum(0, xgb_model.predict(X_test))

xgb_mae  = mean_absolute_error(y_test, xgb_preds)
xgb_rmse = np.sqrt(mean_squared_error(y_test, xgb_preds))
xgb_r2   = r2_score(y_test, xgb_preds)

# ─── 7. WMA BASELINE ──────────────────────────────────────────────────────────
wma_mae  = mean_absolute_error(y_test, wma_test)
wma_rmse = np.sqrt(mean_squared_error(y_test, wma_test))
wma_r2   = r2_score(y_test, wma_test)

# ─── 8. RESULTS ───────────────────────────────────────────────────────────────
print("\n" + "="*52)
print(f"{'Model':<20} {'MAE':>8} {'RMSE':>8} {'R²':>8}")
print("-"*52)
print(f"{'WMA Baseline':<20} {wma_mae:>8.2f} {wma_rmse:>8.2f} {wma_r2:>8.4f}")
print(f"{'Random Forest':<20} {rf_mae:>8.2f} {rf_rmse:>8.2f} {rf_r2:>8.4f}")
print(f"{'XGBoost':<20} {xgb_mae:>8.2f} {xgb_rmse:>8.2f} {xgb_r2:>8.4f}")
print("="*52)

xgb_vs_wma_mae  = (wma_mae  - xgb_mae)  / wma_mae  * 100
xgb_vs_wma_rmse = (wma_rmse - xgb_rmse) / wma_rmse * 100
print(f"\nXGBoost vs WMA: MAE improved {xgb_vs_wma_mae:.1f}%, RMSE improved {xgb_vs_wma_rmse:.1f}%")

# ─── 9. FEATURE IMPORTANCE ────────────────────────────────────────────────────
feat_imp = pd.Series(xgb_model.feature_importances_, index=FEATURES).sort_values(ascending=False)
print("\nTop 10 Feature Importances (XGBoost):")
print(feat_imp.head(10).round(4).to_string())

# ─── 10. SAVE MODEL & METADATA ────────────────────────────────────────────────
best_model = xgb_model  # XGBoost wins

joblib.dump(best_model, "/mnt/user-data/outputs/demand_forecast_model.joblib")
joblib.dump(rf,         "/mnt/user-data/outputs/rf_model.joblib")

# Save encoders + feature list for the predict function
metadata = {
    "features": FEATURES,
    "target": TARGET,
    "category_classes":     le_cat.classes_.tolist(),
    "location_classes":     le_loc.classes_.tolist(),
    "loc_kind_classes":     le_loc_kind.classes_.tolist(),
    "price_tier_classes":   le_tier.classes_.tolist(),
    "metrics": {
        "wma":  {"mae": round(wma_mae,4),  "rmse": round(wma_rmse,4),  "r2": round(wma_r2,4)},
        "rf":   {"mae": round(rf_mae,4),   "rmse": round(rf_rmse,4),   "r2": round(rf_r2,4)},
        "xgb":  {"mae": round(xgb_mae,4),  "rmse": round(xgb_rmse,4),  "r2": round(xgb_r2,4)},
    }
}
with open("/mnt/user-data/outputs/model_metadata.json", "w") as f:
    json.dump(metadata, f, indent=2)

print("\n✅ Saved:")
print("  → demand_forecast_model.joblib  (XGBoost — best model)")
print("  → rf_model.joblib               (Random Forest)")
print("  → model_metadata.json           (features + encoders + metrics)")

# ─── 11. PREDICT FUNCTION (demo) ──────────────────────────────────────────────
print("\n── predict() function demo ──────────────────────────")

def predict_next_month(
    product_id: str,
    location_id: str,
    sales_history: list,   # last 6 months, oldest→newest
    price: float,
    sale_price: float,
    category: str,
    location_kind: str,    # "warehouse" or "branch"
    current_year: int,
    current_month: int,
    stock_at_end: int = 50,
    incoming_qty: int = 0,
    stockout_flag: bool = False,
):
    """
    Predict next month's sales quantity.
    sales_history: list of up to 6 recent monthly sales (oldest first).
    """
    from math import sin, cos, pi
    import calendar

    h = sales_history[-6:] if len(sales_history) >= 6 else sales_history
    while len(h) < 6:
        h = [0] + h

    lag1, lag2, lag3 = h[-1], h[-2], h[-3]
    rolling3 = np.mean(h[-3:])
    rolling6 = np.mean(h[-6:])
    trend = (lag1 - lag3) / lag3 if lag3 > 0 else 0.0

    days = calendar.monthrange(current_year, current_month)[1]
    avg_daily = lag1 / days if days > 0 else 0
    profit_margin = (sale_price - price) / sale_price if sale_price > 0 else 0

    # next month info
    next_month = current_month % 12 + 1
    next_year  = current_year + (1 if current_month == 12 else 0)
    next_days  = calendar.monthrange(next_year, next_month)[1]

    cat_enc      = le_cat.transform([category])[0]      if category      in le_cat.classes_      else 0
    loc_enc      = le_loc.transform([location_id])[0]   if location_id   in le_loc.classes_      else 0
    kind_enc     = le_loc_kind.transform([location_kind])[0] if location_kind in le_loc_kind.classes_ else 0

    _q33 = np.percentile(df["sale_price"], 33)
    _q66 = np.percentile(df["sale_price"], 66)
    _q90 = np.percentile(df["sale_price"], 90)
    sp = sale_price
    if sp <= _q33:   pt = "low"
    elif sp <= _q66: pt = "mid"
    elif sp <= _q90: pt = "high"
    else:            pt = "premium"
    tier_enc = le_tier.transform([pt])[0]

    row = {
        "prev_month_sales":  lag1,
        "prev_2month_sales": lag2,
        "prev_3month_sales": lag3,
        "rolling_avg_3m":    rolling3,
        "rolling_avg_6m":    rolling6,
        "sales_trend":       trend,
        "month_sin":         sin(2 * pi * current_month / 12),
        "month_cos":         cos(2 * pi * current_month / 12),
        "is_winter":         int(current_month in [12, 1, 2]),
        "is_summer":         int(current_month in [6, 7, 8]),
        "month":             current_month,
        "stock_at_end":      stock_at_end,
        "stock_at_start":    stock_at_end + lag1,
        "incoming_qty":      incoming_qty,
        "stockout_flag":     int(stockout_flag),
        "price":             price,
        "sale_price":        sale_price,
        "profit_margin":     profit_margin,
        "avg_daily_sales":   avg_daily,
        "category_enc":      cat_enc,
        "price_tier_enc":    tier_enc,
        "location_enc":      loc_enc,
        "loc_kind_enc":      kind_enc,
        "year":              current_year,
        "days_in_month":     next_days,
        "sales_qty":         lag1,
    }

    X_pred = pd.DataFrame([row])[FEATURES]
    pred = max(0, int(round(best_model.predict(X_pred)[0])))

    # WMA for comparison
    wma = int(round(0.2 * lag3 + 0.3 * lag2 + 0.5 * lag1))

    return {"ml_prediction": pred, "wma_prediction": wma}

# Demo call
result = predict_next_month(
    product_id="P001", location_id="L02",
    sales_history=[40, 45, 38, 50, 55, 48],
    price=321.52, sale_price=374.97,
    category="Electronics", location_kind="branch",
    current_year=2026, current_month=4,
    stock_at_end=80,
)
print(f"Demo prediction → {result}")
print("\nPart 2 complete ✅")
