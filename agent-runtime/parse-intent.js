// Turns a natural-language intent into a typed struct + encoded params.
// CLI: `node parse-intent.js "DCA 10 mUSD into mTKA every 30s, stop at -20%"`
// Library: const { parseIntent } = require("./parse-intent");
const { ethers } = require("ethers");
const { runClaude, extractJson } = require("./claude");
const config = require("./config");

const PROMPT = `You are an intent parser for an on-chain agent. Turn the user's
natural-language description into a strict JSON object. Return only JSON — no
prose, no markdown, no code fences.

Supported intent types and schemas:

1. dca — dollar-cost-average one token into another with optional stop-loss.
   {
     "type": "dca",
     "tokenIn": "mUSD" | "mTKA" | "mTKB",
     "tokenOut": "mUSD" | "mTKA" | "mTKB",
     "amountPerExec": <number of whole tokens, e.g. 10>,
     "intervalSec": <integer seconds between execs, >= 10>,
     "stopLossBps": <basis points drop from first-exec price that triggers stop, 0 if none>
   }

2. conditionalTransfer — one-shot transfer when an oracle price crosses a threshold.
   {
     "type": "conditionalTransfer",
     "token": "mUSD" | "mTKA" | "mTKB",
     "amount": <number of whole tokens>,
     "recipient": "<0x...>",
     "priceToken": "mUSD" | "mTKA" | "mTKB",
     "priceThreshold": <number in USD, e.g. 12.5>,
     "direction": "gte" | "lte"
   }

3. recurringTransfer — not yet implemented in this prototype.
   Return {"type":"error","reason":"recurring transfer not implemented"}.

Validation rules:
- Token symbols must be exactly mUSD, mTKA, or mTKB. Any other name = error.
- If the user mentions real assets (ETH, BTC, USDC, USDT, DAI, etc.) or mainnet,
  return {"type":"error","reason":"this prototype only supports mock tokens"}.
- If the user's message is ambiguous, off-topic, or does not cleanly map to a
  supported type, return {"type":"error","reason":"<short reason>"}.
- Recipient addresses must look like 42-char hex (0x + 40 hex chars). If absent
  and needed, return an error.
- Output JSON only. No prose. No markdown. No code fences.

User message:
"""
<<<NL>>>
"""
`;

const TOKEN_SYMBOLS = new Set(["mUSD", "mTKA", "mTKB"]);

function tokenAddr(sym) {
  if (!TOKEN_SYMBOLS.has(sym)) return null;
  return config.tokens[sym] || null;
}

function isHexAddr(s) {
  return typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
}

function encodeDCA(obj) {
  return ethers.utils.defaultAbiCoder.encode(
    ["tuple(address,address,uint256,uint256,uint256)"],
    [[
      tokenAddr(obj.tokenIn),
      tokenAddr(obj.tokenOut),
      ethers.utils.parseEther(String(obj.amountPerExec)),
      BigInt(obj.intervalSec).toString(),
      String(obj.stopLossBps || 0),
    ]]
  );
}

function encodeConditional(obj) {
  const direction = obj.direction === "lte" ? 1 : 0;
  return ethers.utils.defaultAbiCoder.encode(
    ["tuple(address,uint256,address,address,uint256,uint8)"],
    [[
      tokenAddr(obj.token),
      ethers.utils.parseEther(String(obj.amount)),
      obj.recipient,
      tokenAddr(obj.priceToken),
      ethers.utils.parseEther(String(obj.priceThreshold)),
      direction,
    ]]
  );
}

function validateDCA(obj) {
  if (!tokenAddr(obj.tokenIn)) return "unsupported tokenIn";
  if (!tokenAddr(obj.tokenOut)) return "unsupported tokenOut";
  if (obj.tokenIn === obj.tokenOut) return "tokenIn == tokenOut";
  if (!(Number(obj.amountPerExec) > 0)) return "amountPerExec must be > 0";
  if (!(Number(obj.intervalSec) >= 10)) return "intervalSec must be >= 10";
  const sl = Number(obj.stopLossBps || 0);
  if (sl < 0 || sl > 9999) return "stopLossBps out of range";
  return null;
}

function validateConditional(obj) {
  if (!tokenAddr(obj.token)) return "unsupported token";
  if (!tokenAddr(obj.priceToken)) return "unsupported priceToken";
  if (!(Number(obj.amount) > 0)) return "amount must be > 0";
  if (!isHexAddr(obj.recipient)) return "recipient must be 0x-prefixed 40-hex address";
  if (!(Number(obj.priceThreshold) > 0)) return "priceThreshold must be > 0";
  if (obj.direction !== "gte" && obj.direction !== "lte") return "direction must be gte or lte";
  return null;
}

async function parseIntent(nl) {
  const prompt = PROMPT.replace("<<<NL>>>", nl.replace(/"""/g, "'''"));
  const raw = await runClaude(prompt);
  const obj = extractJson(raw);

  if (obj.type === "error") {
    return { ok: false, error: obj.reason || "parser rejected", llmPrompt: prompt, llmRaw: raw };
  }

  if (obj.type === "dca") {
    const err = validateDCA(obj);
    if (err) return { ok: false, error: err, llmPrompt: prompt, llmRaw: raw };
    return {
      ok: true,
      type: "dca",
      struct: {
        tokenIn: obj.tokenIn,
        tokenOut: obj.tokenOut,
        tokenInAddr: tokenAddr(obj.tokenIn),
        tokenOutAddr: tokenAddr(obj.tokenOut),
        amountPerExec: String(obj.amountPerExec),
        intervalSec: Number(obj.intervalSec),
        stopLossBps: Number(obj.stopLossBps || 0),
      },
      encodedParams: encodeDCA(obj),
      llmPrompt: prompt,
      llmRaw: raw,
    };
  }

  if (obj.type === "conditionalTransfer") {
    const err = validateConditional(obj);
    if (err) return { ok: false, error: err, llmPrompt: prompt, llmRaw: raw };
    return {
      ok: true,
      type: "conditionalTransfer",
      struct: {
        token: obj.token,
        tokenAddr: tokenAddr(obj.token),
        amount: String(obj.amount),
        recipient: obj.recipient,
        priceToken: obj.priceToken,
        priceTokenAddr: tokenAddr(obj.priceToken),
        priceThreshold: String(obj.priceThreshold),
        direction: obj.direction,
      },
      encodedParams: encodeConditional(obj),
      llmPrompt: prompt,
      llmRaw: raw,
    };
  }

  return { ok: false, error: `intent type "${obj.type}" unsupported`, llmPrompt: prompt, llmRaw: raw };
}

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
