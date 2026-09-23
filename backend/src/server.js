import "dotenv/config";
import express from "express";
import cors from "cors";
import extractRouter from "./routes/extract.js";
import priceRouter from "./routes/price.js";
import odooRouter from "./routes/odoo.js";
import modelsRouter from "./routes/models.js";

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
if (provider === "openrouter" && !process.env.OPENROUTER_API_KEY) {
  console.error("FATAL: EXTRACTION_PROVIDER=openrouter but OPENROUTER_API_KEY is not set.");
  process.exit(1);
}

const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean)
);
allowedOrigins.add("https://quote-craft-pilot.vercel.app");

function isAllowedOrigin(origin) {
  return (
    !origin ||
    allowedOrigins.has(origin) ||
    /^https?:\/\/localhost(?::\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
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
app.use("/api", odooRouter);
app.use("/api", modelsRouter);

// Catch-all 404
app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));

app.listen(PORT, () => {
  console.log(`QuotePilot extraction API listening on http://localhost:${PORT}`);
});
