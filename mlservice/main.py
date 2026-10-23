import os

import joblib
import pandas as pd
import xgboost as xgb
from fastapi import FastAPI

from train import add_features

app = FastAPI()

# ==========================================
# LOAD MODEL (create it with: python train.py)
# ==========================================
saved = joblib.load("model.pkl")
model = saved["model"]
feature_names = saved["features"]
ranges = saved["ranges"]

# The model is trained on US dollar loans (dataset.csv), documents are in rupees.
# Rupees are converted with a purchasing-power style rate (about 22 INR per
# international dollar) so amounts land in the range the model has seen,
# instead of a market exchange rate that would make every borrower look poor.
INR_PER_USD = float(os.getenv("INR_PER_USD", "22"))

# How much each NPA event cuts the recovery probability
PENALTIES = {
    "legalAction": 0.85,
    "sarfaesi_13_2": 0.90,
    "sarfaesi_13_4": 0.75,
    "pdcDishonored": 0.85,
}
FACTORY_CLOSED_PENALTY = 0.70

LABELS = {
    "loan_amnt": "Loan amount",
    "annual_inc": "Annual income",
    "dti": "Debt-to-income ratio",
    "int_rate": "Interest rate",
    "term_m": "Loan tenure",
    "installment": "EMI",
    "loan_income_ratio": "Loan-to-income ratio",
    "inst_income_ratio": "EMI-to-income ratio",
    "high_dti": "DTI above 30",
    "low_income": "Low income",
}


@app.get("/")
def health():
    return {"status": "ok", "model_metrics": saved.get("metrics")}


@app.post("/predict")
def predict(data: dict):
    # ---------- inputs from the backend (rupees) ----------
    loan_inr = float(data.get("loanAmount", 0))
    income_inr = float(data.get("annualIncome", 0))
    dti = float(data.get("dti", 0))
    interest_rate = float(data.get("interestRate", 12))   # % per year
    tenure_months = float(data.get("tenureMonths", 36))

    legal_action = int(data.get("legalAction", 0))
    sarfaesi_13_2 = int(data.get("sarfaesi_13_2", 0))
    sarfaesi_13_4 = int(data.get("sarfaesi_13_4", 0))
    pdc_dishonored = int(data.get("pdcDishonored", 0))
    factory_running = int(data.get("factoryRunning", 1))

    # ---------- bring amounts into the dataset's scale ----------
    loan = min(max(loan_inr / INR_PER_USD, ranges["loan_amnt"][0]), ranges["loan_amnt"][1])
    income = min(max(income_inr / INR_PER_USD, ranges["annual_inc"][0]), ranges["annual_inc"][1])

    # The dataset only has 36 and 60 month loans, so tenure is clipped to that span
    int_rate = min(max(interest_rate, ranges["int_rate"][0]), ranges["int_rate"][1])
    term_m = min(max(tenure_months, ranges["term_m"][0]), ranges["term_m"][1])

    row = add_features(
        pd.DataFrame(
            [{
                "loan_amnt": loan,
                "annual_inc": income,
                "dti": dti,
                "int_rate": int_rate,
                "term_m": term_m,
            }]
        )
    )
    X = row[feature_names]

    # ---------- model: probability the loan is NOT recovered ----------
    prob_default = float(model.predict_proba(X)[0][1])
    recovery = 1 - prob_default

    # ---------- NPA specific adjustments ----------
    flags = {
        "legalAction": legal_action,
        "sarfaesi_13_2": sarfaesi_13_2,
        "sarfaesi_13_4": sarfaesi_13_4,
        "pdcDishonored": pdc_dishonored,
    }
    for name, active in flags.items():
        if active:
            recovery *= PENALTIES[name]
    if factory_running == 0:
        recovery *= FACTORY_CLOSED_PENALTY

    recovery = max(0.05, min(0.95, recovery))

    # ---------- risk band ----------
    if recovery >= 0.70:
        risk = "Low"
    elif recovery >= 0.40:
        risk = "Medium"
    else:
        risk = "High"

    # Legal escalation override
    if sarfaesi_13_4:
        risk = "High"
    elif legal_action and risk == "Low":
        risk = "Medium"

    # ---------- top factors: what pushed the model's default estimate ----------
    # XGBoost returns each feature's contribution (log-odds) plus a bias column.
    contrib = model.get_booster().predict(xgb.DMatrix(X), pred_contribs=True)[0][:-1]
    top = sorted(zip(feature_names, contrib), key=lambda x: abs(x[1]), reverse=True)[:3]
    top_factors = [
        {
            "factor": LABELS.get(name, name),
            "impact": round(float(value), 3),
            "effect": "raises default risk" if value > 0 else "lowers default risk",
        }
        for name, value in top
    ]

    return {
        "risk": risk,
        "riskScore": int((1 - recovery) * 100),
        "recoveryProbability": round(recovery, 2),
        "topFactors": top_factors,
    }
