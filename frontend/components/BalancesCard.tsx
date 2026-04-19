"use client";

import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { addresses, isAddressSet } from "@/lib/addresses";
import { erc20Abi } from "@/lib/abi";

const TOKENS = [
  { key: "mUSD", addr: addresses.mUSD },
  { key: "mTKA", addr: addresses.mTKA },
  { key: "mTKB", addr: addresses.mTKB },
] as const;

function fmt(v: unknown) {
  if (typeof v !== "bigint") return "—";
  const n = Number(formatEther(v));
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function BalancesCard({
  owner,
  vault,
}: {
  owner: `0x${string}`;
  vault: `0x${string}` | null;
}) {
  const tokens = TOKENS.filter((t) => isAddressSet(t.addr));

  const contracts = tokens.flatMap((t) => [
    { address: t.addr, abi: erc20Abi, functionName: "balanceOf", args: [owner] } as const,
    ...(vault
      ? [
          {
            address: t.addr,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [vault],
          } as const,
        ]
      : []),
  ]);

  const { data } = useReadContracts({
    contracts,
    query: { refetchInterval: 2000, enabled: contracts.length > 0 },
  });

  if (tokens.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-sm font-semibold mb-3">Token balances</div>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-6 gap-y-1 text-sm font-mono">
        <div className="text-muted text-xs" />
        <div className="text-muted text-xs">Wallet</div>
        <div className="text-muted text-xs">Vault</div>
        {tokens.map((t, i) => {
          const stride = vault ? 2 : 1;
          const walletRes = data?.[i * stride];
          const vaultRes = vault ? data?.[i * stride + 1] : undefined;
          return (
            <div key={t.key} className="contents">
              <div className="text-text/80">{t.key}</div>
              <div>{fmt(walletRes?.result)}</div>
              <div>{vault ? fmt(vaultRes?.result) : <span className="text-muted">—</span>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
