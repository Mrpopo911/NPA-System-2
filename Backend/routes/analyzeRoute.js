const express = require("express");
const router = express.Router();
const multer = require("multer");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

const { extractData } = require("../utils/parser");
const { getPrediction } = require("../services/mlService");

const upload = multer({ storage: multer.memoryStorage() });

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Same cutoffs as the ML service, used only if it doesn't send a risk label
const riskFromProbability = (p) => (p >= 0.7 ? "Low" : p >= 0.4 ? "Medium" : "High");

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    let text = "";

    if (req.file.mimetype === "application/pdf") {
      const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
      try {
        text = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    } else if (req.file.mimetype === DOCX_MIME) {
      text = (await mammoth.extractRawText({ buffer: req.file.buffer })).value;
    } else if (req.file.mimetype === "text/plain") {
      text = req.file.buffer.toString();
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const extracted = extractData(text);

    let prediction;
    try {
      prediction = await getPrediction(extracted);
    } catch (mlErr) {
      console.error("ML service error:", mlErr.message);
      return res.status(503).json({
        error: "Prediction service is not running. Start the ML service (port 8000) and try again.",
      });
    }

    const recoveryProbability = prediction.recoveryProbability;
    // Use the ML service's risk (it includes the SARFAESI 13(4) override)
    const risk = prediction.risk || riskFromProbability(recoveryProbability);

    // Things found in the document. The legal / PDC / factory items lower the
    // score through fixed rules in the ML service; they are not learned from data.
    const findings = [];
    if (extracted.dti > 30) findings.push("High debt-to-income ratio");
    if (extracted.annual_inc < 50000) findings.push("Low income");
    if (extracted.revol_util > 80) findings.push("High credit utilization");
    if (extracted.interestRate > 18) findings.push("High interest rate");
    if (extracted.sarfaesi_13_4) findings.push("SARFAESI 13(4) possession action initiated");
    else if (extracted.sarfaesi_13_2) findings.push("SARFAESI 13(2) notice issued");
    else if (extracted.legalAction) findings.push("Legal action initiated");
    if (extracted.pdcDishonored) findings.push("PDC dishonored");
    if (!extracted.factoryRunning) findings.push("Factory not operational");
    if (extracted.daysOverdue > 365) findings.push("Overdue for more than a year");

    // What the trained model itself pushed towards default
    const modelDrivers = (prediction.topFactors || [])
      .filter((f) => f.impact > 0)
      .map((f) => f.factor);

    const reason =
      `Document findings: ${findings.length ? findings.join(", ") : "none"}. ` +
      `Model drivers: ${modelDrivers.length ? modelDrivers.join(", ") : "none raising risk"}.`;

    res.json({
      extracted,
      recoveryProbability,
      risk,
      riskScore: prediction.riskScore,
      topFactors: prediction.topFactors,
      findings,
      modelDrivers,
      reason,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ error: "Error processing file" });
  }
});

module.exports = router;
