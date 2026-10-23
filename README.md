# NPA Recovery & Risk Prediction System

Upload a loan document (PDF, DOCX or TXT) and get back an estimated **recovery probability**, a **risk level** (Low / Medium / High) and the **reasons** behind it.

It is a small three-service app:

```
React + Vite UI  ──►  Express backend  ──►  FastAPI ML service
   :5173                  :5001                  :8000
```

---

## Features

- Upload PDF, DOCX or TXT loan documents
- Automatic extraction of loan amount, income, DTI, interest rate, tenure, NPA date and legal / recovery flags
- ML-based recovery prediction (XGBoost) with rule-based NPA adjustments
- Risk classification with plain-language reasons
- Dashboard with session history and a risk-distribution chart

---

## How it works

1. **Upload.** The React frontend sends the file to `POST /api/analyze` on the backend.
2. **Text extraction.** The backend reads the file in memory: `pdf-parse` for PDFs, `mammoth` for DOCX, plain text for TXT.
3. **Field extraction** (`Backend/utils/parser.js`). Regexes pull out the loan amount, annual income, DTI, interest rate, tenure and NPA date, and keyword checks set these flags: legal notice, SARFAESI 13(2), SARFAESI 13(4), dishonored PDC and factory not running. Anything that can't be found falls back to a default (loan ₹5,00,000, income ₹6,00,000, DTI 10, interest rate 12%, tenure 36 months, 90 days overdue). A tenure written without a unit is read as years if it is 30 or less, otherwise as months.
4. **ML service** (`mlservice/main.py`):
   - Converts rupee amounts into the scale of the training data (see *Model* below).
   - Derives the EMI from amount, rate and tenure, then the model predicts the probability that the loan is **not** recovered. Recovery probability = 1 − that value.
   - NPA events then reduce the recovery probability:

     | Event | Multiplier |
     |---|---|
     | Legal action / legal notice | × 0.85 |
     | SARFAESI 13(2) notice | × 0.90 |
     | SARFAESI 13(4) possession | × 0.75 |
     | PDC dishonored | × 0.85 |
     | Factory not running | × 0.70 |

   - The result is clamped to 0.05 – 0.95 and mapped to a risk level: **Low** ≥ 0.70, **Medium** ≥ 0.40, otherwise **High**. SARFAESI 13(4) always forces **High**, and any legal action lifts **Low** to at least **Medium**.
5. **Response.** The backend builds the explanation in two labelled parts so it is clear where each comes from:
   - **Document findings:** things read from the document (high DTI, low income, high interest rate, SARFAESI stage, dishonored PDC, factory not running, overdue more than a year). The legal, PDC and factory items lower the score through the fixed multipliers above. They are assumptions, not something the model learned.
   - **Model drivers:** the inputs that pushed the trained model's default estimate up (for example loan tenure or DTI).

### Model

- **Data:** `mlservice/dataset.csv` (LendingClub loans, ~396k rows). *Charged Off* counts as not recovered, *Fully Paid* as recovered (about 19.6% charged off).
- **Algorithm:** XGBoost classifier, trained by `mlservice/train.py`.
- **Features (10):** loan amount, annual income, DTI, interest rate, tenure, EMI, loan-to-income ratio, EMI-to-income ratio, a high-DTI flag and a low-income flag. These are all values a loan document normally contains (EMI is calculated from amount, rate and tenure). Fields a document won't contain, such as grade or revolving balance, are deliberately not used.
- **Currency:** the dataset is in US dollars, so rupee amounts are divided by about 22 (a purchasing-power style rate, set with the `INR_PER_USD` environment variable) and clipped to the training range. Interest rate and tenure are clipped too, and since the dataset only has 36 and 60 month loans, longer tenures are treated as 60 months.
- **Quality:** ROC-AUC is **0.707** on a held-out 20% (Brier score 0.144). Run `python compare_models.py` to reproduce the comparison below.

| Features | XGBoost | LightGBM | CatBoost | Hist. GB | Logistic reg. |
|---|---|---|---|---|---|
| Amount, income, DTI + ratios (6) | 0.638 | 0.638 | 0.639 | 0.636 | 0.633 |
| **+ interest rate, tenure, EMI (10), used** | **0.707** | 0.708 | 0.707 | 0.706 | 0.699 |

The choice of algorithm hardly matters (all within 0.01); the interest rate and tenure are what lift the score. Adding every other field in the dataset (credit-bureau and employment details, 21 features) only reaches about 0.72, so this dataset has a low ceiling. Treat the probability as a rough indicator, not a precise estimate. The rule-based multipliers above are judgement-based, not learned from data.

---

## Tech stack

| Part | Stack |
|---|---|
| Frontend | React 19, Vite, Recharts |
| Backend | Node.js, Express 5, Multer, pdf-parse 2, Mammoth, Axios |
| ML service | Python, FastAPI, XGBoost, scikit-learn, pandas |

---

## Project structure

```
NPA_Recovery/
├── Backend/
│   ├── server.js              # Express app (port 5001)
│   ├── routes/analyzeRoute.js # upload, parse, call ML, build response
│   ├── services/mlService.js  # HTTP client for the ML service
│   └── utils/parser.js        # regex / keyword field extraction
├── mlservice/
│   ├── main.py                # FastAPI /predict endpoint (port 8000)
│   ├── train.py               # trains model.pkl from dataset.csv
│   ├── compare_models.py      # benchmarks several algorithms
│   ├── model.pkl              # trained model
│   ├── dataset.csv            # training data (not committed)
│   └── requirements.txt
├── frontend/                  # React + Vite dashboard
└── README.md
```

---

## Setup

Requirements: Node.js 18+ and Python 3.10+ (check with `python3 --version`). Run each service in its own terminal.

### 1. ML service

```bash
cd mlservice
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

On macOS, if XGBoost complains about `libomp`, run `brew install libomp`.

`model.pkl` is already included. To retrain it, put `dataset.csv` in `mlservice/` and run `python train.py`.

### 2. Backend

```bash
cd Backend
npm install
npm run dev
```

Runs on port 5001. `routes/analyzeRoute.js` imports `utils/parser` and `services/mlService` by absolute path, so update those two paths if the project lives somewhere else.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

---

## API

`POST http://localhost:5001/api/analyze` with `multipart/form-data` and a `file` field (PDF, DOCX or TXT).

```json
{
  "extracted": { "loanAmount": 500000, "annualIncome": 600000, "dti": 35, "interestRate": 14, "tenureMonths": 60, "daysOverdue": 645, "legalAction": 1, "sarfaesi_13_2": 1, "...": "..." },
  "recoveryProbability": 0.29,
  "risk": "High",
  "riskScore": 70,
  "topFactors": [
    { "factor": "Debt-to-income ratio", "impact": 0.294, "effect": "raises default risk" },
    { "factor": "Loan tenure", "impact": 0.19, "effect": "raises default risk" },
    { "factor": "Annual income", "impact": 0.166, "effect": "raises default risk" }
  ],
  "findings": ["High debt-to-income ratio", "SARFAESI 13(2) notice issued", "PDC dishonored", "Factory not operational", "Overdue for more than a year"],
  "modelDrivers": ["Debt-to-income ratio", "Loan tenure", "Annual income"],
  "reason": "Document findings: High debt-to-income ratio, SARFAESI 13(2) notice issued, ... Model drivers: Debt-to-income ratio, Loan tenure, Annual income."
}
```

Errors: `400` for a missing file or unsupported type, `503` if the ML service is not running (the backend does not invent a prediction), `500` if processing fails. The dashboard shows these messages in the Result card.

### Try it

Save this as `sample.txt` and upload it:

```
Loan Amount: 500000
Annual Income: 600000
DTI: 35
Interest Rate: 14% p.a.
Tenure: 60 months
NPA Date: 2025-01-15
Legal notice issued under SARFAESI 13(2). Factory not running. PDC dishonored.
```

---

## Limitations

- Extraction is regex-based, so it expects labels like `Loan Amount:`, `Annual Income:`, `DTI:`, `Interest Rate:` (with a `%`), `Tenure:` and `NPA Date:`. Differently worded documents fall back to defaults.
- The training data is US consumer lending, not Indian NPA accounts. Predictions are indicative only.
- History in the dashboard is kept in browser memory and clears on refresh.
