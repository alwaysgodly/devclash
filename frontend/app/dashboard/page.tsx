"use client";

import Link from "next/link";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther } from "viem";
import { ChainGuard } from "@/components/ChainGuard";
import { BalancesCard } from "@/components/BalancesCard";
import { addresses, isAddressSet } from "@/lib/addresses";
import { vaultFactoryAbi, intentRegistryAbi, agentVaultAbi, dcaExecutorAbi } from "@/lib/abi";

function shorten(a: string, n = 6) {
  return a.length > n * 2 + 2 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a;
}

function IntentRow({
  intentId,
  vault,
  onRefresh,
}: {
  intentId: `0x${string}`;
  vault: `0x${string}`;
  onRefresh: () => void;
}) {
  const { data: intent } = useReadContract({
    address: addresses.intentRegistry,
    abi: intentRegistryAbi,
    functionName: "getIntent",
    args: [intentId],
    query: { enabled: isAddressSet(addresses.intentRegistry) },
  });

  const { data: approval } = useReadContract({
    address: vault,
    abi: agentVaultAbi,
    functionName: "approvals",
    args: [intentId],
    query: { enabled: !!vault, refetchInterval: 3000 },
  });

  const dcaExecutorAddr =
    (process.env.NEXT_PUBLIC_DCA_EXECUTOR_ADDR as `0x${string}`) || "0x";
  const intentExecutor = (intent as any)?.executor as string | undefined;
  const isDca =
    !!intentExecutor &&
    !!dcaExecutorAddr &&
    intentExecutor.toLowerCase() === dcaExecutorAddr.toLowerCase();

  const { data: isStopped } = useReadContract({
    address: dcaExecutorAddr,
    abi: dcaExecutorAbi,
    functionName: "stopped",
    args: [intentId],
    query: { enabled: isDca, refetchInterval: 3000 },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  });

  const busy = isPending || isLoading;
  if (isLoading === false && hash) {
    // refresh when tx lands
    setTimeout(onRefresh, 500);
  }

  if (!intent) return null;

  const registryActive = (intent as any).active;
  const nonce = (intent as any).nonce as bigint;

  const approvalTuple = approval as
    | readonly [`0x${string}`, bigint, bigint, boolean, `0x${string}`, boolean]
    | undefined;

  const token = approvalTuple?.[0];
  const cap = approvalTuple?.[1];
  const spent = approvalTuple?.[2];
  const paused = approvalTuple?.[3];
  const vaultActive = approvalTuple?.[5];

  // Distinguish "vault approval never created" (user forgot to click Approve
  // cap on /new) from "vault approval existed and was revoked".
  const neverApproved =
    !vaultActive && (!cap || cap === 0n) && nonce === 0n;

  const statusLabel = !registryActive
    ? "Revoked"
    : neverApproved
    ? "Not approved"
    : !vaultActive
    ? "Vault-revoked"
    : isStopped
    ? "Stopped (stop-loss)"
    : paused
    ? "Paused"
    : "Active";

  const statusColor =
    statusLabel === "Active"
      ? "text-ok"
      : statusLabel === "Paused"
      ? "text-warn"
      : "text-err";

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-mono text-muted">{shorten(intentId, 8)}</div>
          <div className={"text-xs font-semibold " + statusColor}>{statusLabel}</div>
        </div>
        <div className="text-xs text-muted">Executions: {nonce?.toString()}</div>
      </div>

      {cap !== undefined && token && (
        <div className="mt-3 text-sm text-text/80 font-mono">
          Cap: {formatEther(cap)} / Spent: {formatEther(spent!)}
          <span className="text-muted"> · token {shorten(token, 6)}</span>
        </div>
      )}

      {isStopped && (
        <div className="mt-3 rounded border border-err/30 bg-err/5 px-3 py-2 text-xs text-err">
          Stop-loss triggered — this intent will not execute again. Raising the
          price back won't restart it (stop state is terminal on the executor).
        </div>
      )}

      {neverApproved && (
        <div className="mt-3 rounded border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          This intent is registered but the vault never approved a spending
          cap — every execute will revert with <span className="font-mono">Vault: inactive</span>.
          Click Deactivate below and create a fresh agent, making sure to
          complete both <span className="font-semibold">Register intent</span>{" "}
          and <span className="font-semibold">Approve cap</span> on the New agent page.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {registryActive && vaultActive && (
          <>
            {!isStopped && (
              <button
                disabled={busy}
                onClick={() =>
                  writeContract({
                    address: vault,
                    abi: agentVaultAbi,
                    functionName: "setPaused",
                    args: [intentId, !paused],
                  })
                }
                className="rounded border border-line bg-bg px-3 py-1 text-xs hover:border-accent disabled:opacity-50"
              >
                {paused ? "Resume" : "Pause"}
              </button>
            )}
            <button
              disabled={busy}
              onClick={() =>
                writeContract({
                  address: vault,
                  abi: agentVaultAbi,
                  functionName: "revokeIntent",
                  args: [intentId],
                })
              }
              className="rounded border border-err/40 bg-err/10 text-err px-3 py-1 text-xs hover:bg-err/20 disabled:opacity-50"
            >
              Revoke vault
            </button>
            <button
              disabled={busy}
              onClick={() =>
                writeContract({
                  address: addresses.intentRegistry,
                  abi: intentRegistryAbi,
                  functionName: "deactivate",
                  args: [intentId],
                })
              }
              className="rounded border border-err/40 bg-err/10 text-err px-3 py-1 text-xs hover:bg-err/20 disabled:opacity-50"
            >
              Deactivate
            </button>
          </>
        )}
        <Link
          href={`/explain/${intentId}`}
          className="rounded border border-accent/50 text-accent px-3 py-1 text-xs hover:bg-accent/10"
        >
          Explain →
        </Link>
      </div>
    </div>
  );
}

function EmergencyCard({ vault }: { vault: `0x${string}` }) {
  const tokens = [
    { key: "mUSD", addr: addresses.mUSD },
    { key: "mTKA", addr: addresses.mTKA },
    { key: "mTKB", addr: addresses.mTKB },
  ].filter((t) => isAddressSet(t.addr));

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || isLoading;

  return (
    <div className="rounded-lg border border-err/40 bg-err/5 p-4">
      <h3 className="text-sm font-semibold text-err mb-2">Emergency withdraw</h3>
      <p className="text-xs text-muted mb-3">
        Returns the entire balance of a token to your wallet, regardless of any
        active intent. Use this if something looks wrong.
      </p>
      <div className="flex flex-wrap gap-2">
        {tokens.map((t) => (
          <button
            key={t.key}
            disabled={busy}
            onClick={() =>
              writeContract({
                address: vault,
                abi: agentVaultAbi,
                functionName: "emergencyWithdraw",
                args: [t.addr],
              })
            }
            className="rounded border border-err/40 bg-err/10 text-err px-3 py-1 text-xs hover:bg-err/20 disabled:opacity-50"
          >
            Withdraw all {t.key}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();

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

  const { data: ids, refetch } = useReadContract({
    address: addresses.intentRegistry,
    abi: intentRegistryAbi,
    functionName: "listByOwner",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isAddressSet(addresses.intentRegistry) },
  });

  const intentIds = (ids as `0x${string}`[] | undefined) || [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted text-sm mt-2">Your agents, their state, and their kill-switch.</p>
        </div>
        <Link
          href="/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          + New agent
        </Link>
      </div>

      <ChainGuard>
        {!isConnected ? (
          <div className="rounded-lg border border-line bg-panel p-8 text-center text-text/80">
            Connect a wallet to see your agents.
          </div>
        ) : !vault ? (
          <div className="rounded-lg border border-warn/40 bg-warn/10 p-6 text-sm">
            No vault yet — <Link href="/" className="underline">deploy one</Link> first.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-xs text-muted font-mono break-all">
              Vault: {vault}
            </div>

            <BalancesCard owner={address as `0x${string}`} vault={vault} />

            {intentIds.length === 0 ? (
              <div className="rounded-lg border border-line bg-panel p-8 text-center text-text/80">
                You haven't deployed any agents yet.{" "}
                <Link href="/new" className="text-accent underline">Create one</Link>.
              </div>
            ) : (
              <div className="space-y-3">
                {intentIds.map((id) => (
                  <IntentRow
                    key={id}
                    intentId={id}
                    vault={vault}
                    onRefresh={() => refetch()}
                  />
                ))}
              </div>
            )}

            <EmergencyCard vault={vault} />
          </div>
        )}
      </ChainGuard>
    </div>
  );
}
