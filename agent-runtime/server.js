// HTTP endpoints for the frontend to read logs and parse NL intents via Claude.
// CORS is wide-open for prototype demo convenience; production would lock down.
const express = require("express");
const cors = require("cors");
const config = require("./config");
const { readTail, readByIntent } = require("./logger");
const { parseIntent } = require("./parse-intent");

function startHttpServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, chainId: config.chainId });
  });

  app.get("/logs", (req, res) => {
    const n = Math.min(Number(req.query.n) || 100, 1000);
    const intentId = req.query.intentId;
    const rows = intentId ? readByIntent(intentId, n) : readTail(n);
    res.json({ rows });
  });

  app.post("/parse-intent", async (req, res) => {
    try {
      const nl = String(req.body && req.body.nl ? req.body.nl : "").slice(0, 2000);
      if (!nl) return res.status(400).json({ error: "nl required" });
      const result = await parseIntent(nl);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.listen(config.httpPort, () => {
    console.log(`agent-runtime HTTP server on :${config.httpPort}`);
  });
}

module.exports = { startHttpServer };
