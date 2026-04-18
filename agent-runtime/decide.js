const { runClaude, extractJson } = require("./claude");

function buildPrompt({ intentType, intentId, ownerAddr, reason, extras }) {
  const extrasJson = extras ? JSON.stringify(extras, null, 2) : "{}";
  return `You are the decision and explanation layer for an autonomous on-chain agent.

An off-chain deterministic condition check has determined that intent ${intentId}
(type: ${intentType}) is ready to execute. The trigger reason is: "${reason}".
Owner: ${ownerAddr}.

Intent state:
${extrasJson}

Your job: confirm the execution and produce a brief human-readable explanation
for the user's Explain log. Default is to execute; only return "skip" if you see
something contradictory in the intent state that the deterministic layer missed
(e.g. the intent state shows something incoherent that a human would catch).

Respond with a strict JSON object and nothing else. Example shapes:
{"action":"execute","explanation":"Interval elapsed and price is within the stop-loss threshold; swapping 10 mUSD -> mTKA."}
{"action":"skip","explanation":"Intent state shows contradictory params; flagging for human review."}

Constraints:
- action must be exactly "execute" or "skip"
- explanation must be <= 280 characters
- respond only with the JSON object, no prose, no markdown
`;
}

async function decide(ctx) {
  const prompt = buildPrompt(ctx);
  const raw = await runClaude(prompt);
  const obj = extractJson(raw);
  if (obj.action !== "execute" && obj.action !== "skip") {
    throw new Error(`invalid action: ${JSON.stringify(obj.action)}`);
  }
  const explanation = String(obj.explanation || "").slice(0, 280);
  return { action: obj.action, explanation, llmPrompt: prompt, llmRaw: raw };
}

module.exports = { decide };
