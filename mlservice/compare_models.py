"""
Benchmark several algorithms on the same split and feature sets.
Usage:  python compare_models.py      (needs dataset.csv)

LightGBM and CatBoost are optional: install them to include them
(pip install lightgbm catboost), otherwise they are skipped.
"""
import warnings

import pandas as pd
import xgboost as xgb
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from train import FEATURES, add_features

warnings.filterwarnings("ignore")

df = pd.read_csv(
    "dataset.csv",
    usecols=["loan_amnt", "annual_inc", "dti", "int_rate", "term", "loan_status"],
)
df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])].dropna()
df["term_m"] = df["term"].str.strip().str.split().str[0].astype(int)
y = (df["loan_status"] == "Charged Off").astype(int)
X_all = add_features(df)

CORE = ["loan_amnt", "annual_inc", "dti", "loan_income_ratio", "high_dti", "low_income"]
feature_sets = {"core (no rate/tenure)": CORE, "with rate + tenure (used)": FEATURES}

models = {
    "XGBoost": xgb.XGBClassifier(
        n_estimators=400, max_depth=5, learning_rate=0.05, subsample=0.8,
        colsample_bytree=0.9, min_child_weight=20, tree_method="hist",
        random_state=42, n_jobs=-1,
    ),
    "HistGradientBoosting": HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, min_samples_leaf=200, random_state=42
    ),
    "LogisticRegression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=500)),
}
try:
    import lightgbm as lgb
    models["LightGBM"] = lgb.LGBMClassifier(
        n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=200,
        subsample=0.8, subsample_freq=1, colsample_bytree=0.9, random_state=42, verbose=-1,
    )
except ImportError:
    pass
try:
    from catboost import CatBoostClassifier
    models["CatBoost"] = CatBoostClassifier(
        iterations=500, depth=6, learning_rate=0.06, verbose=0, random_seed=42
    )
except ImportError:
    pass

for set_name, cols in feature_sets.items():
    X_train, X_test, y_train, y_test = train_test_split(
        X_all[cols], y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"\n{set_name}")
    for name, model in models.items():
        model.fit(X_train, y_train)
        auc = roc_auc_score(y_test, model.predict_proba(X_test)[:, 1])
        print(f"  {name:22s} ROC-AUC {auc:.4f}")
