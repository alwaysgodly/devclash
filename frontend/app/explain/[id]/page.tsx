"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChainGuard } from "@/components/ChainGuard";
import { fetchLogs, runtimeHealth, type LogRow } from "@/lib/runtime";

function RowView({ row }: { row: LogRow }) {
  const when = new Date(row.ts).toLocaleTimeString();
  const tag = row.event || "unknown";
  const color =
    tag === "executed"
      ? "text-ok"
      : tag === "decision"
      ? "text-accent"
      : tag === "execute-error" || tag === "cycle-error"
      ? "text-err"
      : "text-muted";

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted font-mono">{when}</span>
        <span className={"text-xs font-semibold uppercase tracking-wide " + color}>
          {tag}
        </span>
        {row.intentType && (
          <span className="text-xs text-muted">· {row.intentType}</span>
        )}
      </div>
      {row.reason && (
        <div className="mt-2 text-sm text-text/80">
          <span className="text-muted">trigger:</span>{" "}
          <span className="font-mono">{row.reason}</span>
        </div>
      )}
      {row.decision && (
        <div className="mt-2 text-sm">
          <div>
            <span className="text-muted">decision:</span>{" "}
            <span className={row.decision.action === "execute" ? "text-ok" : "text-warn"}>
              {row.decision.action}
            </span>
            {row.decision.fallback && (
              <span className="ml-2 text-xs text-warn">[deterministic fallback]</span>
            )}
          </div>
          <div className="mt-1 text-text/90 italic">"{row.decision.explanation}"</div>
          {row.decision.llmError && (
            <div className="mt-1 text-xs text-err">LLM error: {row.decision.llmError}</div>
          )}
        </div>
      )}
      {row.txHash && (
        <div className="mt-2 text-xs font-mono text-accent break-all">
          tx: {row.txHash}
          {row.block && <span className="ml-2 text-muted">@ block {row.block}</span>}
        </div>
      )}
      {row.message && (
        <div className="mt-2 text-xs text-err font-mono">{row.message}</div>
      )}
    </div>
  );
}

export default function Explain() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      const ok = await runtimeHealth();
      if (!alive) return;
      setHealthy(ok);
      if (!ok) return;
      try {
        const rs = await fetchLogs({ intentId: id, n: 200 });
        if (alive) setRows(rs);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    }
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="text-sm text-muted mb-2">
        <Link href="/dashboard" className="hover:text-text">← Dashboard</Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Agent log</h1>
      <p className="text-xs text-muted font-mono break-all mt-1">{id}</p>

      <ChainGuard>
        <div className="mt-6 space-y-3">
          {healthy === false && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm">
              Agent runtime is offline. Logs only appear when the team laptop is running{" "}
              <code className="font-mono">node index.js</code>.
            </div>
          )}
          {err && (
            <div className="rounded-lg border border-err/40 bg-err/10 p-4 text-sm text-err">
              {err}
            </div>
          )}
          {healthy && rows && rows.length === 0 && (
            <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
              No log entries for this intent yet. Wait for the next 15s cycle.
            </div>
          )}
          {rows &&
            rows
              .slice()
              .reverse()
              .map((r, i) => <RowView key={i} row={r} />)}
        </div>
      </ChainGuard>
    </div>
  );
}
