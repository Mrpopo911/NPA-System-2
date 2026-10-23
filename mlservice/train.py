"""
Train the recovery model from dataset.csv (LendingClub loans).

Target: a loan that is "Charged Off" counts as not recovered (1),
"Fully Paid" counts as recovered (0). The service reports 1 - P(charged off).

Only fields that a loan document normally contains are used: loan amount,
income, DTI, interest rate and tenure, plus ratios built from them (EMI is
calculated from amount, rate and tenure). Grade, revolving balance and similar
bureau fields are NOT used because documents don't contain them.

Usage:  python train.py        ->  writes model.pkl
"""
import json

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split

FEATURES = [
    "loan_amnt",
    "annual_inc",
    "dti",
    "int_rate",
    "term_m",
    "installment",
    "loan_income_ratio",
    "inst_income_ratio",
    "high_dti",
    "low_income",
]
DTI_CAP = 60  # the dataset has junk DTI values up to 9999


def emi(loan, annual_rate_pct, months):
    """Standard EMI formula (matches the dataset's installment column)."""
    r = annual_rate_pct / 1200.0
    growth = (1 + r) ** months
    return loan * r * growth / (growth - 1)


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Needs loan_amnt, annual_inc, dti, int_rate, term_m. Shared with main.py."""
    df = df.copy()
    df["dti"] = df["dti"].clip(0, DTI_CAP)
    df["installment"] = emi(df["loan_amnt"], df["int_rate"], df["term_m"])
    df["loan_income_ratio"] = df["loan_amnt"] / (df["annual_inc"] + 1)
    df["inst_income_ratio"] = df["installment"] * 12 / (df["annual_inc"] + 1)
    df["high_dti"] = (df["dti"] > 30).astype(int)
    df["low_income"] = (df["annual_inc"] < 50000).astype(int)
    return df


def main():
    df = pd.read_csv(
        "dataset.csv",
        usecols=["loan_amnt", "annual_inc", "dti", "int_rate", "term", "loan_status"],
    )
    df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])].dropna()
    df["term_m"] = df["term"].str.strip().str.split().str[0].astype(int)
    y = (df["loan_status"] == "Charged Off").astype(int)

    # Ranges seen in training; main.py clips inputs to them
    ranges = {
        col: [float(df[col].quantile(0.005)), float(df[col].quantile(0.995))]
        for col in ["loan_amnt", "annual_inc"]
    }
    ranges["int_rate"] = [float(df["int_rate"].min()), float(df["int_rate"].max())]
    ranges["term_m"] = [int(df["term_m"].min()), int(df["term_m"].max())]

    X = add_features(df)[FEATURES]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # No class weighting on purpose: we use the probability itself,
    # so it needs to stay calibrated.
    model = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.9,
        min_child_weight=20,
        tree_method="hist",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    prob = model.predict_proba(X_test)[:, 1]
    metrics = {
        "model": "XGBoost",
        "roc_auc": round(float(roc_auc_score(y_test, prob)), 4),
        "brier": round(float(brier_score_loss(y_test, prob)), 4),
        "charge_off_rate": round(float(y.mean()), 4),
        "rows": int(len(df)),
    }
    print(json.dumps(metrics, indent=2))

    joblib.dump(
        {"model": model, "features": FEATURES, "ranges": ranges, "metrics": metrics},
        "model.pkl",
    )
    print("Saved model.pkl")


if __name__ == "__main__":
    main()
