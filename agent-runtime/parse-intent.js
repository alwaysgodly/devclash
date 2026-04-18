// Turns a natural-language intent into a typed struct.
// Invokable two ways:
//   1. CLI: `node parse-intent.js "DCA 10 mUSD into mTKA every 30s, stop at -20%"`
//   2. Library: const { parseIntent } = require("./parse-intent");
const { ethers } = require("ethers");
const { runClaude, extractJson } = require("./claude");
const config = require("./config");

const PROMPT = `You are an intent parser for an on-chain agent. Turn the user's
natural-language description into a strict JSON object. Return only JSON, no
prose, no markdown.

Allowed intent types and schemas:

1. dca — dollar-cost-average one token into another with optional stop-loss.
   { "type": "dca",
     "tokenIn": "mUSD"|"mTKA"|"mTKB",
     "tokenOut": "mUSD"|"mTKA"|"mTKB",
     "amountPerExec": <number of tokens, e.g. 10>,
     "intervalSec": <integer seconds between execs>,
     "stopLossBps": <basis points drop from start price that triggers stop, 0 if none>
   }

2. conditionalTransfer — send a one-time amount when a price threshold is hit.
   (not yet implemented in the prototype — reject if user asks for this.)

3. recurringTransfer — send a fixed amount on a time interval.
   (not yet implemented in the prototype — reject if user asks for this.)

Rules:
- Token symbols must be one of mUSD, mTKA, mTKB exactly.
- If the user's message is ambiguous, off-topic, refers to mainnet, uses real
  token names (USDC, ETH, etc.), or does not cleanly map to a supported type,
  return {"type":"error","reason":"<short reason>"}.
- amountPerExec is in whole tokens (the executor will multiply by 1e18 when
  encoding).
- intervalSec must be >= 10.
- Never include markdown, never narrate your reasoning, output JSON only.

User message: """
<<<NL>>>
"""
`;

async function parseIntent(nl) {
  const prompt = PROMPT.replace("<<<NL>>>", nl.replace(/"""/g, "'''"));
  const raw = await runClaude(prompt);
  const obj = extractJson(raw);

  if (obj.type === "error") {
    return { ok: false, error: obj.reason || "parser rejected", llmPrompt: prompt, llmRaw: raw };
  }

  if (obj.type !== "dca") {
    return {
      ok: false,
      error: `intent type "${obj.type}" not implemented yet in the prototype`,
      llmPrompt: prompt,
      llmRaw: raw,
    };
  }

  // Validate + resolve addresses
  const tokens = config.tokens;
  if (!tokens[obj.tokenIn] || !tokens[obj.tokenOut]) {
    return { ok: false, error: `unsupported token symbol(s)`, llmPrompt: prompt, llmRaw: raw };
  }
  if (obj.tokenIn === obj.tokenOut) {
    return { ok: false, error: "tokenIn == tokenOut", llmPrompt: prompt, llmRaw: raw };
  }
  if (!(Number(obj.amountPerExec) > 0)) {
    return { ok: false, error: "amountPerExec must be > 0", llmPrompt: prompt, llmRaw: raw };
  }
  if (!(Number(obj.intervalSec) >= 10)) {
    return { ok: false, error: "intervalSec must be >= 10", llmPrompt: prompt, llmRaw: raw };
  }
  const stopLossBps = Number(obj.stopLossBps || 0);
  if (stopLossBps < 0 || stopLossBps > 9999) {
    return { ok: false, error: "stopLossBps out of range", llmPrompt: prompt, llmRaw: raw };
  }

  const encoded = ethers.utils.defaultAbiCoder.encode(
    ["tuple(address,address,uint256,uint256,uint256)"],
    [[
      tokens[obj.tokenIn],
      tokens[obj.tokenOut],
      ethers.utils.parseEther(String(obj.amountPerExec)),
      BigInt(obj.intervalSec).toString(),
      stopLossBps.toString(),
    ]]
  );

  return {
    ok: true,
    type: "dca",
    struct: {
      tokenIn: obj.tokenIn,
      tokenOut: obj.tokenOut,
      tokenInAddr: tokens[obj.tokenIn],
      tokenOutAddr: tokens[obj.tokenOut],
      amountPerExec: String(obj.amountPerExec),
      intervalSec: Number(obj.intervalSec),
      stopLossBps,
    },
    encodedParams: encoded,
    llmPrompt: prompt,
    llmRaw: raw,
  };
}

// CLI entry point
if (require.main === module) {
  const nl = process.argv.slice(2).join(" ");
  if (!nl) {
    console.error('usage: node parse-intent.js "<natural language intent>"');
    process.exit(2);
  }
  parseIntent(nl)
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error(e);
      process.exit(3);
    });
}

module.exports = { parseIntent };
