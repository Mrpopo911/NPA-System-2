const axios = require("axios");

const ML_URL = process.env.ML_URL || "http://localhost:8000/predict";

// No silent fallback: if the ML service is down this throws, and the route
// answers 503 instead of showing a made-up prediction.
exports.getPrediction = async (data) => {
  const res = await axios.post(ML_URL, data, { timeout: 15000 });
  return res.data;
};
