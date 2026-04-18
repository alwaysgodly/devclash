"use client";

import { useState } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { addresses, isAddressSet } from "@/lib/addresses";
import { vaultFactoryAbi, agentVaultAbi, erc20Abi } from "@/lib/abi";

const TOKENS = [
  { key: "mUSD", label: "Mock USD" },
  { key: "mTKA", label: "Mock Token A" },
  { key: "mTKB", label: "Mock Token B" },
] as const;

export function FundVaultCard() {
  const { address } = useAccount();
  const [tokenKey, setTokenKey] = useState<"mUSD" | "mTKA" | "mTKB">("mUSD");
  const [amount, setAmount] = useState("100");

  const { data: vaultAddr } = useReadContract({
    address: addresses.vaultFactory,
    abi: vaultFactoryAbi,
    functionName: "vaultOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isAddressSet(addresses.vaultFactory),
      refetchInterval: 2000,
    },
  });

  const vault =
    typeof vaultAddr === "string" &&
    vaultAddr !== "0x0000000000000000000000000000000000000000"
      ? (vaultAddr as `0x${string}`)
      : null;

  const tokenAddr = addresses[tokenKey];
  const { writeContract: writeApprove, data: approveHash, isPending: pApprove } =
    useWriteContract();
  const { isLoading: waitingApprove, isSuccess: approveOk } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: writeDeposit, data: depositHash, isPending: pDeposit } =
    useWriteContract();
  const { isLoading: waitingDeposit } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  if (!vault) {
    return <div className="text-sm text-muted">Deploy your vault first.</div>;
  }
  if (!isAddressSet(tokenAddr)) {
    return (
      <div className="text-sm text-muted">
        Token addresses not configured. Run the deploy scripts.
      </div>
    );
  }

  const busy = pApprove || pDeposit || waitingApprove || waitingDeposit;
  const amt = Number(amount);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select
          className="rounded-md border border-line bg-bg px-3 py-2 text-sm"
          value={tokenKey}
          onChange={(e) => setTokenKey(e.target.value as typeof tokenKey)}
        >
          {TOKENS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.key} ({t.label})
            </option>
          ))}
        </select>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32 rounded-md border border-line bg-bg px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={busy || !amt || amt <= 0}
          onClick={() =>
            writeApprove({
              address: tokenAddr,
              abi: erc20Abi,
              functionName: "approve",
              args: [vault, parseEther(amount)],
            })
          }
          className="rounded-md border border-line bg-bg px-4 py-2 text-sm hover:border-accent disabled:opacity-50"
        >
          {pApprove || waitingApprove
            ? "Approving…"
            : approveOk
            ? "✓ 1. Approved"
            : "1. Approve"}
        </button>

        <button
          disabled={busy || !amt || amt <= 0 || !approveOk}
          onClick={() =>
            writeDeposit({
              address: vault,
              abi: agentVaultAbi,
              functionName: "deposit",
              args: [tokenAddr, parseEther(amount)],
            })
          }
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pDeposit || waitingDeposit
            ? "Depositing…"
            : depositHash && !waitingDeposit
            ? "✓ 2. Deposited"
            : "2. Deposit"}
        </button>
      </div>

      {approveHash && (
        <div className="text-xs">
          <span className="text-ok">Approve tx</span>{" "}
          <span className="font-mono text-text/70 break-all">{approveHash}</span>
          {waitingApprove && <span className="text-muted"> · mining…</span>}
          {approveOk && <span className="text-ok"> · confirmed</span>}
        </div>
      )}
      {depositHash && (
        <div className="text-xs">
          <span className="text-ok">Deposit tx</span>{" "}
          <span className="font-mono text-text/70 break-all">{depositHash}</span>
          {waitingDeposit && <span className="text-muted"> · mining…</span>}
          {!waitingDeposit && depositHash && (
            <span className="text-ok"> · confirmed — {amount} {tokenKey} moved into the vault</span>
          )}
        </div>
      )}

      <div className="text-xs text-muted">
        Vault: <span className="font-mono break-all">{vault}</span>
      </div>
    </div>
  );
}
