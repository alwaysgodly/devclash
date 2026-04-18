// Deterministic fallback if the `claude` CLI is unavailable or returns garbage.
// Policy: trust the deterministic condition check, execute with a canned
// explanation. Never deadlock the user's intent because of our LLM.

function deterministicDecide({ intentType, reason }) {
  return {
    action: "execute",
    explanation: `Deterministic fallback (LLM unavailable): ${intentType} condition "${reason}" met — executing per intent rules.`,
    llmFallback: true,
  };
}

module.exports = { deterministicDecide };
