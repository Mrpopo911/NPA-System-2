const extractData = (text) => {
  text = text.toLowerCase();

  // -----------------------------
  // NUMERIC EXTRACTION
  // -----------------------------
  const loanAmount =
    text.match(/(loan amount|amount|outstanding)[:\s₹]*([\d,]+)/i)?.[2];

  const annualIncome =
    text.match(/(income|annual income)[:\s₹]*([\d,]+)/i)?.[2];

  const dti =
    text.match(/dti[:\s]*([\d.]+)/i)?.[1];

  // -----------------------------
  // INTEREST RATE (%) AND TENURE
  // -----------------------------
  // Rate needs a % sign so amounts like "interest overdue: 12,345" are not picked up
  const rateMatch =
    text.match(/(?:interest rate|rate of interest|roi|interest)[^\d\n]{0,15}(\d{1,2}(?:\.\d+)?)\s*%/i) ||
    text.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:p\.?\s?a\.?|per annum)/i);
  let interestRate = rateMatch ? Number(rateMatch[1]) : 12;
  if (interestRate < 1 || interestRate > 40) interestRate = 12;

  // "Tenure: 60 months", "tenor 5 years"; with no unit, up to 30 is read as years
  let tenureMonths = 36;
  const tenureMatch = text.match(
    /(?:tenure|tenor|repayment period|term)\s*[:\-]?\s*(\d{1,3})\s*(months?|mos?|years?|yrs?)?/i
  );
  if (tenureMatch) {
    const n = Number(tenureMatch[1]);
    const unit = tenureMatch[2] ? tenureMatch[2].toLowerCase() : null;
    const asYears = unit ? unit.startsWith("y") : n <= 30;
    tenureMonths = asYears ? n * 12 : n;
  }

  // -----------------------------
  // DATE → DAYS OVERDUE
  // -----------------------------
  let daysOverdue = 90;

  const npaDateMatch = text.match(/npa date[:\s]*([\d\-\/]+)/i);
  if (npaDateMatch) {
    const npaDate = new Date(npaDateMatch[1]);
    const today = new Date();
    daysOverdue = Math.floor((today - npaDate) / (1000 * 60 * 60 * 24));
  }

  // -----------------------------
  // FLAGS (LEGAL / SARFAESI)
  // -----------------------------
  const legalAction =
    text.includes("sarfaesi") || text.includes("legal notice") ? 1 : 0;

  const sarfaesi_13_2 =
    text.includes("13(2)") ? 1 : 0;

  const sarfaesi_13_4 =
    text.includes("13(4)") ? 1 : 0;

  const pdcDishonored =
    text.includes("dishonored") || text.includes("bounced") ? 1 : 0;

  const factoryRunning =
    text.includes("not running") || text.includes("closed") ? 0 : 1;

  // -----------------------------
  // CLEAN NUMBERS
  // -----------------------------
  const cleanNumber = (val, def) =>
    val ? Number(val.replace(/,/g, "")) : def;
// -----------------------------
// DERIVED ML FEATURES
// -----------------------------

const loan = cleanNumber(loanAmount, 500000);
const income = cleanNumber(annualIncome, 600000);
const dtiVal = dti ? Number(dti) : 10;

// simple approximations
const open_acc = Math.max(1, Math.floor(income / 200000));
const pub_rec = legalAction ? 1 : 0;
const revol_bal = Math.floor(loan * 0.3);
const revol_util = Math.min(100, dtiVal * 2);
const total_acc = open_acc + 5;
  return {
  loanAmount: loan,
  annualIncome: income,
  dti: dtiVal,
  interestRate,
  tenureMonths,
  daysOverdue,

  // old flags
  legalAction,
  sarfaesi_13_2,
  sarfaesi_13_4,
  pdcDishonored,
  factoryRunning,

  //  NEW ML FIELDS
  loan_amnt: loan,
  annual_inc: income,
  open_acc,
  pub_rec,
  revol_bal,
  revol_util,
  total_acc
};
};


module.exports = { extractData };