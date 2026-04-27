// Turns a natural-language intent into a typed struct + encoded params.
// CLI: `node parse-intent.js "DCA 10 mUSD into mTKA every 30s, stop at -20%"`
// Library: const { parseIntent } = require("./parse-intent");
const { ethers } = require("ethers");
const { runLLM, extractJson } = require("./llm");
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

3. recurringTransfer — transfer on a time interval, up to an optional max count.
   {
     "type": "recurringTransfer",
     "token": "mUSD" | "mTKA" | "mTKB",
     "amount": <number of whole tokens>,
     "recipient": "<0x...>",
     "intervalSec": <integer seconds, >= 10>,
     "maxExecutions": <integer >= 0; 0 means unlimited>
   }

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

function encodeRecurring(obj) {
  return ethers.utils.defaultAbiCoder.encode(
    ["tuple(address,uint256,address,uint256,uint256)"],
    [[
      tokenAddr(obj.token),
      ethers.utils.parseEther(String(obj.amount)),
      obj.recipient,
      BigInt(obj.intervalSec).toString(),
      String(obj.maxExecutions || 0),
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

function validateRecurring(obj) {
  if (!tokenAddr(obj.token)) return "unsupported token";
  if (!(Number(obj.amount) > 0)) return "amount must be > 0";
  if (!isHexAddr(obj.recipient)) return "recipient must be 0x-prefixed 40-hex address";
  if (!(Number(obj.intervalSec) >= 10)) return "intervalSec must be >= 10";
  const me = Number(obj.maxExecutions || 0);
  if (me < 0 || !Number.isInteger(me)) return "maxExecutions must be a non-negative integer";
  return null;
}

function regexFallbackParse(nl) {
  const text = String(nl).trim();
  // DCA: "DCA 10 mUSD into mTKA every 30 seconds, stop at -20%"
  //      "dollar-cost average 25 mUSD into mTKB every 60s with no stop-loss"
  //      "Swap 5 mUSD to mTKA every minute; sell if mTKA drops 15% from start"
  const dcaRe = /(?:dca|dollar[- ]cost average|swap)\s+(\d+(?:\.\d+)?)\s+(mUSD|mTKA|mTKB)\s+(?:into|to)\s+(mUSD|mTKA|mTKB)\s+every\s+(\d+)\s*(?:s|sec|seconds|minute|minutes|min)?/i;
  const dcaMatch = text.match(dcaRe);
  if (dcaMatch) {
    const isMinute = /minute|min/i.test(dcaMatch[0]);
    const intervalSec = Number(dcaMatch[4]) * (isMinute ? 60 : 1);
    const stopRe = /(?:stop[- ]?loss|stop|sell)\s*(?:at|if|when)?\s*(?:-|drops?\s+)?(\d+(?:\.\d+)?)\s*%/i;
    const noStopRe = /no stop[- ]?loss/i;
    const stopMatch = !noStopRe.test(text) && text.match(stopRe);
    const stopLossBps = stopMatch ? Math.round(Number(stopMatch[1]) * 100) : 0;
    return {
      type: "dca",
      tokenIn: dcaMatch[2],
      tokenOut: dcaMatch[3],
      amountPerExec: Number(dcaMatch[1]),
      intervalSec,
      stopLossBps,
    };
  }

  // Conditional transfer: "When mTKA price goes above $12, send 100 mUSD to 0x..."
  //                       "If mTKB drops below $3, transfer 50 mUSD to 0x..."
  const condRe = /(?:when|if)\s+(mUSD|mTKA|mTKB)(?:\s+price)?\s+(?:goes?\s+)?(above|below|drops?\s+below|rises?\s+above|>=|<=|>|<)\s*\$?(\d+(?:\.\d+)?)\s*,?\s*(?:send|transfer)\s+(\d+(?:\.\d+)?)\s+(mUSD|mTKA|mTKB)\s+to\s+(0x[0-9a-fA-F]{40})/i;
  const condMatch = text.match(condRe);
  if (condMatch) {
    const dir = /below|drops?|<=|</i.test(condMatch[2]) ? "lte" : "gte";
    return {
      type: "conditionalTransfer",
      token: condMatch[5],
      amount: Number(condMatch[4]),
      recipient: condMatch[6],
      priceToken: condMatch[1],
      priceThreshold: Number(condMatch[3]),
      direction: dir,
    };
  }

  // Recurring: "Every 45 seconds send 20 mUSD to 0x... up to 5 times"
  //            "Every minute send 10 mUSD to 0x..."
  const recRe = /every\s+(\d+)\s*(s|sec|seconds|minute|minutes|min)?\s*,?\s*(?:send|transfer)\s+(\d+(?:\.\d+)?)\s+(mUSD|mTKA|mTKB)\s+to\s+(0x[0-9a-fA-F]{40})(?:\s+up\s+to\s+(\d+)\s*(?:times|executions)?)?/i;
  const recMatch = text.match(recRe);
  if (recMatch) {
    const unit = (recMatch[2] || "").toLowerCase();
    const isMinute = unit.startsWith("min");
    const intervalSec = Number(recMatch[1]) * (isMinute ? 60 : 1);
    return {
      type: "recurringTransfer",
      token: recMatch[4],
      amount: Number(recMatch[3]),
      recipient: recMatch[5],
      intervalSec,
      maxExecutions: recMatch[6] ? Number(recMatch[6]) : 0,
    };
  }

  return null;
}

async function parseIntent(nl) {
  const prompt = PROMPT.replace("<<<NL>>>", nl.replace(/"""/g, "'''"));

  let obj;
  let raw = "";
  let usedFallback = false;
  let llmError = null;

  try {
    raw = await runLLM(prompt);
    obj = extractJson(raw);
  } catch (e) {
    llmError = e.message;
    const fb = regexFallbackParse(nl);
    if (!fb) {
      return {
        ok: false,
        error: `LLM unavailable and regex fallback couldn't match the input. ${llmError}`,
        llmPrompt: prompt,
        llmRaw: raw,
      };
    }
    obj = fb;
    usedFallback = true;
  }

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
      fallback: usedFallback,
      llmError,
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
      fallback: usedFallback,
      llmError,
    };
  }

  if (obj.type === "recurringTransfer") {
    const err = validateRecurring(obj);
    if (err) return { ok: false, error: err, llmPrompt: prompt, llmRaw: raw };
    return {
      ok: true,
      type: "recurringTransfer",
      struct: {
        token: obj.token,
        tokenAddr: tokenAddr(obj.token),
        amount: String(obj.amount),
        recipient: obj.recipient,
        intervalSec: Number(obj.intervalSec),
        maxExecutions: Number(obj.maxExecutions || 0),
      },
      encodedParams: encodeRecurring(obj),
      llmPrompt: prompt,
      llmRaw: raw,
      fallback: usedFallback,
      llmError,
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
