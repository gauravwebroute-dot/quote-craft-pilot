import "dotenv/config";
import express from "express";
import cors from "cors";
import extractRouter from "./routes/extract.js";
import priceRouter from "./routes/price.js";

const app = express();
const PORT = process.env.PORT || 4000;

const provider = (process.env.EXTRACTION_PROVIDER || "anthropic").toLowerCase();
if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
  console.error("FATAL: EXTRACTION_PROVIDER=gemini but GEMINI_API_KEY is not set.");
  process.exit(1);
}
if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
  console.error("FATAL: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || /^https?:\/\/localhost(?::\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed: ${origin}`));
    },
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", extractRouter);
app.use("/api", priceRouter);

// Catch-all 404
app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));

app.listen(PORT, () => {
  console.log(`QuotePilot extraction API listening on http://localhost:${PORT}`);
});
