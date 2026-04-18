const fs = require("fs");
const path = require("path");

const LOG_PATH = path.join(__dirname, "log.jsonl");

function logEvent(record) {
  const entry = { ts: new Date().toISOString(), ...record };
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  // Also mirror to stdout for live visibility during demo
  console.log(JSON.stringify(entry));
  return entry;
}

function readTail(n = 100) {
  if (!fs.existsSync(LOG_PATH)) return [];
  const raw = fs.readFileSync(LOG_PATH, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  return lines
    .slice(-n)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readByIntent(intentId, n = 100) {
  return readTail(10000).filter((e) => e.intentId === intentId).slice(-n);
}

module.exports = { logEvent, readTail, readByIntent, LOG_PATH };
