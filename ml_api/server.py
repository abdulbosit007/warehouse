"""
ML Demand Forecasting API Server
Loads the trained XGBoost model and serves predictions via REST API.

Start:  python ml_api/server.py
Or:     uvicorn ml_api.server:app --port 8787 --reload
"""

import os
import json
import math
import calendar
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Load model ───────────────────────────────────────────────────────────────
MODEL_PATH = Path(__file__).resolve().parent.parent / "demand_forecast_model.joblib"

print(f"Loading model from {MODEL_PATH} ...")
if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model not found at {MODEL_PATH}")

model = joblib.load(MODEL_PATH)
print("[OK] Model loaded successfully")

# ─── Encoder mappings ─────────────────────────────────────────────────────────
# These must match what LabelEncoder produced during training.
# LabelEncoder sorts classes alphabetically.

# From the synthetic data generation, the categories used were:
CATEGORY_CLASSES = sorted([
    "Auto Parts", "Beauty", "Clothing", "Electronics", "Food & Beverages",
    "Furniture", "Garden", "Home Appliances", "Kitchen", "Office Supplies",
    "Sports", "Toys"
])
CATEGORY_MAP = {c: i for i, c in enumerate(CATEGORY_CLASSES)}

# Synthetic location IDs were L01–L05
LOCATION_CLASSES = sorted(["L01", "L02", "L03", "L04", "L05"])
LOCATION_MAP = {loc: i for i, loc in enumerate(LOCATION_CLASSES)}

# location_kind: "branch" < "warehouse" alphabetically
LOC_KIND_MAP = {"branch": 0, "warehouse": 1}

# price_tier: alphabetical → high=0, low=1, mid=2, premium=3
PRICE_TIER_MAP = {"high": 0, "low": 1, "mid": 2, "premium": 3}

# Feature list (must match training order exactly)
FEATURES = [
    "prev_month_sales", "prev_2month_sales", "prev_3month_sales",
    "rolling_avg_3m", "rolling_avg_6m",
    "sales_trend",
    "month_sin", "month_cos", "is_winter", "is_summer", "month",
    "stock_at_end", "stock_at_start", "incoming_qty", "stockout_flag",
    "price", "sale_price", "profit_margin", "avg_daily_sales",
    "category_enc", "price_tier_enc",
    "location_enc", "loc_kind_enc",
    "year", "days_in_month",
    "sales_qty",
]

# Price tier thresholds (from synthetic data generation, approximate)
# These are used to classify products by their sale_price into tiers
PRICE_TIER_THRESHOLDS = {"q33": 80, "q66": 200, "q90": 400}

# ─── Real location → synthetic location mapping ──────────────────────────────
# Map your real Supabase location UUIDs to the synthetic training location IDs.
# Warehouses → L01 (warehouse), Branches → L02–L04 (branches)
REAL_LOCATION_MAP = {
    # Warehouses → map to L01 (trained as warehouse)
    "483b6b56-ce3f-446c-a5d0-4b8ffcc27997": "L01",  # Warehouse-1 (Ombor)
    "f407e07e-dc91-425d-a3d2-e7d3db7b5ed2": "L01",  # Warehouse-2 (SU)
    # Branches → map to L02–L04 (trained as branches)
    "29a131cb-70da-45bc-ab36-32a22ce86d64": "L02",  # Branch-1 (Bek-To'pi 9B)
    "3fe3fcf1-750c-45bf-94e1-408f741265d8": "L03",  # Branch-2 (Jomiy)
    "4c5524fd-2512-4077-9758-60e1ac6c6d7a": "L04",  # Branch-3 (Pavilion)
}


def get_price_tier(sale_price: float) -> str:
    if sale_price <= PRICE_TIER_THRESHOLDS["q33"]:
        return "low"
    elif sale_price <= PRICE_TIER_THRESHOLDS["q66"]:
        return "mid"
    elif sale_price <= PRICE_TIER_THRESHOLDS["q90"]:
        return "high"
    return "premium"


# ─── API ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="WMS Demand Forecasting API",
    description="ML-powered demand prediction using XGBoost",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    product_id: str
    location_id: str
    location_kind: str  # "warehouse" or "branch"
    price: float
    sale_price: float
    category: Optional[str] = None
    current_stock: int = 50
    incoming_qty: int = 0
    stockout: bool = False
    sales_history: list[int] = []  # last 6 months, oldest → newest
    current_year: Optional[int] = None
    current_month: Optional[int] = None


class BatchPredictRequest(BaseModel):
    products: list[PredictRequest]


class PredictResponse(BaseModel):
    product_id: str
    ml_prediction: int
    wma_prediction: int
    confidence: str  # "high", "medium", "low" based on data quality


def _predict_single(req: PredictRequest) -> PredictResponse:
    """Run prediction for a single product."""
    from datetime import datetime

    now = datetime.now()
    current_year = req.current_year or now.year
    current_month = req.current_month or now.month

    # Pad sales history to 6 months
    h = list(req.sales_history[-6:]) if req.sales_history else []
    while len(h) < 6:
        h = [0] + h

    lag1, lag2, lag3 = h[-1], h[-2], h[-3]
    rolling3 = float(np.mean(h[-3:]))
    rolling6 = float(np.mean(h[-6:]))
    trend = (lag1 - lag3) / lag3 if lag3 > 0 else 0.0

    days = calendar.monthrange(current_year, current_month)[1]
    avg_daily = lag1 / days if days > 0 else 0
    profit_margin = (req.sale_price - req.price) / req.sale_price if req.sale_price > 0 else 0

    # Next month info
    next_month = current_month % 12 + 1
    next_year = current_year + (1 if current_month == 12 else 0)
    next_days = calendar.monthrange(next_year, next_month)[1]

    # Encode category (default to 0 if unknown)
    cat_enc = CATEGORY_MAP.get(req.category, 0)

    # Map real location UUID → synthetic location ID → encoded index
    synthetic_loc = REAL_LOCATION_MAP.get(req.location_id)
    if synthetic_loc:
        loc_enc = LOCATION_MAP.get(synthetic_loc, 0)
    else:
        # Unknown location: use branch default (L02) or warehouse (L01)
        default = "L01" if req.location_kind == "warehouse" else "L02"
        loc_enc = LOCATION_MAP.get(default, 0)

    kind_enc = LOC_KIND_MAP.get(req.location_kind, 0)

    # Price tier
    tier = get_price_tier(req.sale_price)
    tier_enc = PRICE_TIER_MAP.get(tier, 1)

    row = {
        "prev_month_sales": lag1,
        "prev_2month_sales": lag2,
        "prev_3month_sales": lag3,
        "rolling_avg_3m": rolling3,
        "rolling_avg_6m": rolling6,
        "sales_trend": trend,
        "month_sin": math.sin(2 * math.pi * current_month / 12),
        "month_cos": math.cos(2 * math.pi * current_month / 12),
        "is_winter": int(current_month in [12, 1, 2]),
        "is_summer": int(current_month in [6, 7, 8]),
        "month": current_month,
        "stock_at_end": req.current_stock,
        "stock_at_start": req.current_stock + lag1,
        "incoming_qty": req.incoming_qty,
        "stockout_flag": int(req.stockout),
        "price": req.price,
        "sale_price": req.sale_price,
        "profit_margin": profit_margin,
        "avg_daily_sales": avg_daily,
        "category_enc": cat_enc,
        "price_tier_enc": tier_enc,
        "location_enc": loc_enc,
        "loc_kind_enc": kind_enc,
        "year": current_year,
        "days_in_month": next_days,
        "sales_qty": lag1,
    }

    X_pred = pd.DataFrame([row])[FEATURES]
    ml_pred = max(0, int(round(float(model.predict(X_pred)[0]))))

    # WMA for comparison
    wma_pred = max(0, int(round(0.2 * lag3 + 0.3 * lag2 + 0.5 * lag1)))

    # Confidence based on how much REAL data we have
    # Only count the original months sent (not the zero-padded ones)
    original_len = len(req.sales_history) if req.sales_history else 0
    original_nonzero = sum(1 for v in (req.sales_history or []) if v > 0)
    
    if original_nonzero >= 3:
        confidence = "high"
    elif original_nonzero >= 2:
        confidence = "medium"
    else:
        confidence = "low"

    return PredictResponse(
        product_id=req.product_id,
        ml_prediction=ml_pred,
        wma_prediction=wma_pred,
        confidence=confidence,
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": "XGBoost",
        "features": len(FEATURES),
        "locations_mapped": len(REAL_LOCATION_MAP),
    }


@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    try:
        return _predict_single(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/batch", response_model=list[PredictResponse])
async def predict_batch(req: BatchPredictRequest):
    try:
        return _predict_batch_vectorized(req.products)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _predict_batch_vectorized(products: list[PredictRequest]) -> list[PredictResponse]:
    """Vectorized batch prediction — builds one DataFrame, calls model.predict() once."""
    from datetime import datetime

    if not products:
        return []

    now = datetime.now()
    rows = []
    product_ids = []
    histories = []

    for req in products:
        current_year = req.current_year or now.year
        current_month = req.current_month or now.month

        # Pad sales history to 6 months
        h = list(req.sales_history[-6:]) if req.sales_history else []
        while len(h) < 6:
            h = [0] + h

        lag1, lag2, lag3 = h[-1], h[-2], h[-3]
        rolling3 = float(np.mean(h[-3:]))
        rolling6 = float(np.mean(h[-6:]))
        trend = (lag1 - lag3) / lag3 if lag3 > 0 else 0.0

        days = calendar.monthrange(current_year, current_month)[1]
        avg_daily = lag1 / days if days > 0 else 0
        profit_margin = (req.sale_price - req.price) / req.sale_price if req.sale_price > 0 else 0

        next_month = current_month % 12 + 1
        next_year = current_year + (1 if current_month == 12 else 0)
        next_days = calendar.monthrange(next_year, next_month)[1]

        cat_enc = CATEGORY_MAP.get(req.category, 0)

        synthetic_loc = REAL_LOCATION_MAP.get(req.location_id)
        if synthetic_loc:
            loc_enc = LOCATION_MAP.get(synthetic_loc, 0)
        else:
            default = "L01" if req.location_kind == "warehouse" else "L02"
            loc_enc = LOCATION_MAP.get(default, 0)

        kind_enc = LOC_KIND_MAP.get(req.location_kind, 0)
        tier = get_price_tier(req.sale_price)
        tier_enc = PRICE_TIER_MAP.get(tier, 1)

        rows.append({
            "prev_month_sales": lag1,
            "prev_2month_sales": lag2,
            "prev_3month_sales": lag3,
            "rolling_avg_3m": rolling3,
            "rolling_avg_6m": rolling6,
            "sales_trend": trend,
            "month_sin": math.sin(2 * math.pi * current_month / 12),
            "month_cos": math.cos(2 * math.pi * current_month / 12),
            "is_winter": int(current_month in [12, 1, 2]),
            "is_summer": int(current_month in [6, 7, 8]),
            "month": current_month,
            "stock_at_end": req.current_stock,
            "stock_at_start": req.current_stock + lag1,
            "incoming_qty": req.incoming_qty,
            "stockout_flag": int(req.stockout),
            "price": req.price,
            "sale_price": req.sale_price,
            "profit_margin": profit_margin,
            "avg_daily_sales": avg_daily,
            "category_enc": cat_enc,
            "price_tier_enc": tier_enc,
            "location_enc": loc_enc,
            "loc_kind_enc": kind_enc,
            "year": current_year,
            "days_in_month": next_days,
            "sales_qty": lag1,
        })
        product_ids.append(req.product_id)
        histories.append(h)

    # Single vectorized prediction for ALL products
    X_batch = pd.DataFrame(rows)[FEATURES]
    ml_preds = np.maximum(0, np.round(model.predict(X_batch))).astype(int)

    # Build responses
    results = []
    for i, req in enumerate(products):
        h = histories[i]
        lag1, lag2, lag3 = h[-1], h[-2], h[-3]
        wma_pred = max(0, int(round(0.2 * lag3 + 0.3 * lag2 + 0.5 * lag1)))

        original_nonzero = sum(1 for v in (products[i].sales_history or []) if v > 0)
        if original_nonzero >= 3:
            confidence = "high"
        elif original_nonzero >= 2:
            confidence = "medium"
        else:
            confidence = "low"

        results.append(PredictResponse(
            product_id=product_ids[i],
            ml_prediction=int(ml_preds[i]),
            wma_prediction=wma_pred,
            confidence=confidence,
        ))

    return results


# ─── Run directly ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    print("\n--- Starting ML API server on http://localhost:8787")
    print("    Docs available at http://localhost:8787/docs\n")
    uvicorn.run(app, host="0.0.0.0", port=8787)
