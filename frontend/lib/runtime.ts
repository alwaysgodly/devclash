// Thin client for the agent-runtime HTTP server running on the team laptop.
export const RUNTIME_URL =
  process.env.NEXT_PUBLIC_RUNTIME_URL || "http://localhost:7777";

export type DCAStruct = {
  tokenIn: string;
  tokenOut: string;
  tokenInAddr: `0x${string}`;
  tokenOutAddr: `0x${string}`;
  amountPerExec: string;
  intervalSec: number;
  stopLossBps: number;
};

export type ConditionalStruct = {
  token: string;
  tokenAddr: `0x${string}`;
  amount: string;
  recipient: `0x${string}`;
  priceToken: string;
  priceTokenAddr: `0x${string}`;
  priceThreshold: string;
  direction: "gte" | "lte";
};

export type ParseResult =
  | {
      ok: true;
      type: "dca";
      struct: DCAStruct;
      encodedParams: `0x${string}`;
      llmPrompt?: string;
      llmRaw?: string;
    }
  | {
      ok: true;
      type: "conditionalTransfer";
      struct: ConditionalStruct;
      encodedParams: `0x${string}`;
      llmPrompt?: string;
      llmRaw?: string;
    }
  | { ok: false; error: string; llmPrompt?: string; llmRaw?: string };

export async function parseIntent(nl: string): Promise<ParseResult> {
  const res = await fetch(`${RUNTIME_URL}/parse-intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nl }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    return { ok: false, error: `runtime error: ${msg}` };
  }
  return (await res.json()) as ParseResult;
}

export type LogRow = {
  ts: string;
  intentId?: string;
  event?: string;
  intentType?: string;
  reason?: string;
  decision?: {
    action: "execute" | "skip";
    explanation: string;
    fallback?: boolean;
    llmError?: string;
  };
  txHash?: string;
  block?: number;
  explanation?: string;
  message?: string;
};

export async function fetchLogs({
  intentId,
  n = 200,
}: { intentId?: string; n?: number } = {}): Promise<LogRow[]> {
  const qs = new URLSearchParams();
  if (intentId) qs.set("intentId", intentId);
  qs.set("n", String(n));
  const res = await fetch(`${RUNTIME_URL}/logs?${qs.toString()}`);
  if (!res.ok) throw new Error(`runtime /logs ${res.status}`);
  const body = (await res.json()) as { rows: LogRow[] };
  return body.rows;
}

export async function runtimeHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${RUNTIME_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
