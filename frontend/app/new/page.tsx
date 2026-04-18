"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { parseEther, keccak256, toBytes } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import Link from "next/link";
import { ChainGuard } from "@/components/ChainGuard";
import { parseIntent, type ParseResult } from "@/lib/runtime";
import { addresses, isAddressSet } from "@/lib/addresses";
import { vaultFactoryAbi, intentRegistryAbi, agentVaultAbi } from "@/lib/abi";

const PRESETS = [
  "DCA 10 mUSD into mTKA every 30 seconds, stop at -20%",
  "Dollar-cost average 25 mUSD into mTKB every 60 seconds with no stop-loss",
  "Swap 5 mUSD to mTKA every minute; sell if mTKA drops 15% from start",
];

function makeIntentId(owner: `0x${string}`): `0x${string}` {
  const seed = `${owner}:${Date.now()}:${Math.random()}`;
  return keccak256(toBytes(seed));
}

export default function NewIntent() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [nl, setNl] = useState(PRESETS[0]);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [capMultiplier, setCapMultiplier] = useState(10);
  const [intentId, setIntentId] = useState<`0x${string}` | null>(null);

  const { data: vaultAddr } = useReadContract({
    address: addresses.vaultFactory,
    abi: vaultFactoryAbi,
    functionName: "vaultOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isAddressSet(addresses.vaultFactory) },
  });
  const vault =
    typeof vaultAddr === "string" &&
    vaultAddr !== "0x0000000000000000000000000000000000000000"
      ? (vaultAddr as `0x${string}`)
      : null;

  const executor = addresses.dcaExecutor;
  const registry = addresses.intentRegistry;

  const cap = useMemo(() => {
    if (!parsed || !parsed.ok) return null;
    const perExec = Number(parsed.struct.amountPerExec);
    return String(perExec * capMultiplier);
  }, [parsed, capMultiplier]);

  async function onParse() {
    setParsing(true);
    setParseErr(null);
    setParsed(null);
    try {
      const r = await parseIntent(nl);
      setParsed(r);
      if (!r.ok) setParseErr(r.error);
    } catch (e) {
      setParseErr((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  const { writeContract: writeRegister, data: regHash, isPending: pReg } =
    useWriteContract();
  const { isLoading: waitingReg, isSuccess: regOk } = useWaitForTransactionReceipt({
    hash: regHash,
  });

  const { writeContract: writeApprove, data: apprHash, isPending: pAppr } =
    useWriteContract();
  const { isLoading: waitingAppr, isSuccess: apprOk } = useWaitForTransactionReceipt({
    hash: apprHash,
  });

  function onCreate() {
    if (!parsed || !parsed.ok || !vault || !address) return;
    const id = intentId || makeIntentId(address as `0x${string}`);
    if (!intentId) setIntentId(id);
    writeRegister({
      address: registry,
      abi: intentRegistryAbi,
      functionName: "registerIntent",
      args: [id, vault, executor, parsed.encodedParams],
    });
  }

  function onApprove() {
    if (!parsed || !parsed.ok || !vault || !intentId || !cap) return;
    writeApprove({
      address: vault,
      abi: agentVaultAbi,
      functionName: "approveIntent",
      args: [intentId, parsed.struct.tokenInAddr, parseEther(cap), executor],
    });
  }

  const createDisabled =
    !parsed || !parsed.ok || !vault || !isAddressSet(executor) || !isAddressSet(registry);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">New agent</h1>
      <p className="text-muted text-sm mt-2 max-w-xl">
        Describe what you want in English. Claude parses it into a typed on-chain
        intent. You approve a finite spending cap for the agent and the runtime
        takes it from there.
      </p>

      <ChainGuard>
        {!isConnected ? (
          <div className="mt-10 rounded-lg border border-line bg-panel p-8 text-center text-text/80">
            Connect a wallet first.
          </div>
        ) : !vault ? (
          <div className="mt-10 rounded-lg border border-warn/40 bg-warn/10 p-6 text-sm">
            Deploy your vault on the <Link href="/" className="underline">home page</Link> first.
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <section className="rounded-lg border border-line bg-panel p-6">
              <h2 className="text-lg font-semibold mb-2">1. Describe the agent</h2>
              <textarea
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm font-mono"
                placeholder="e.g., DCA 10 mUSD into mTKA every 30 seconds, stop at -20%"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setNl(p)}
                    className="text-xs rounded border border-line bg-bg px-2 py-1 text-muted hover:text-text"
                  >
                    {p.slice(0, 42)}…
                  </button>
                ))}
              </div>
              <button
                onClick={onParse}
                disabled={parsing || !nl}
                className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {parsing ? "Asking Claude…" : "Parse with Claude"}
              </button>
              {parseErr && (
                <div className="mt-3 rounded border border-err/40 bg-err/10 p-3 text-sm text-err">
                  {parseErr}
                </div>
              )}
            </section>

            {parsed && parsed.ok && (
              <section className="rounded-lg border border-line bg-panel p-6">
                <h2 className="text-lg font-semibold mb-2">2. Confirm parameters</h2>
                <div className="text-sm text-text/80 space-y-1 font-mono">
                  <div>Type: <span className="text-accent">{parsed.type}</span></div>
                  <div>Sell: {parsed.struct.amountPerExec} {parsed.struct.tokenIn} / exec</div>
                  <div>Buy: {parsed.struct.tokenOut}</div>
                  <div>Interval: every {parsed.struct.intervalSec}s</div>
                  <div>
                    Stop-loss:{" "}
                    {parsed.struct.stopLossBps > 0
                      ? `${(parsed.struct.stopLossBps / 100).toFixed(1)}% drop`
                      : "disabled"}
                  </div>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <label className="block text-sm mb-1">
                    Spending cap: {capMultiplier} × {parsed.struct.amountPerExec} {parsed.struct.tokenIn}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={capMultiplier}
                    onChange={(e) => setCapMultiplier(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-muted mt-1">
                    Total cap: <span className="font-mono text-text">{cap} {parsed.struct.tokenIn}</span> —
                    agent cannot pull more than this from your vault.
                  </div>
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={onCreate}
                    disabled={createDisabled || pReg || waitingReg || regOk}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {pReg || waitingReg ? "Registering…" : regOk ? "✓ Registered" : "1. Register intent"}
                  </button>
                  <button
                    onClick={onApprove}
                    disabled={!regOk || pAppr || waitingAppr || apprOk}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {pAppr || waitingAppr ? "Approving…" : apprOk ? "✓ Approved" : "2. Approve cap"}
                  </button>
                  {apprOk && (
                    <button
                      onClick={() => router.push("/dashboard")}
                      className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent"
                    >
                      Go to dashboard →
                    </button>
                  )}
                </div>

                {!isAddressSet(executor) && (
                  <div className="mt-3 text-xs text-err">
                    DCAExecutor address not configured — set NEXT_PUBLIC_DCA_EXECUTOR_ADDR.
                  </div>
                )}
              </section>
            )}

            {parsed && parsed.ok && (
              <details className="rounded-lg border border-line bg-panel p-4 text-xs">
                <summary className="cursor-pointer text-muted">
                  View Claude's full parse (prompt + response)
                </summary>
                <div className="mt-3 space-y-3">
                  {parsed.llmPrompt && (
                    <div>
                      <div className="text-muted mb-1">prompt</div>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] text-text/80">{parsed.llmPrompt}</pre>
                    </div>
                  )}
                  {parsed.llmRaw && (
                    <div>
                      <div className="text-muted mb-1">raw response</div>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] text-text/80">{parsed.llmRaw}</pre>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </ChainGuard>
    </div>
  );
}
