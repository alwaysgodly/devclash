"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { HELA_TESTNET_ID, LOCALHOST_ID, ALLOWED_CHAIN_IDS } from "@/lib/chains";

/// Wraps children. If the connected wallet is on a chain other than HeLa testnet
/// or Hardhat Localhost (for local dev), shows a clear error and a switch button;
/// children don't render.
export function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected) return <>{children}</>;
  if ((ALLOWED_CHAIN_IDS as readonly number[]).includes(chainId)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-xl mt-16 rounded-lg border border-err/50 bg-err/10 p-6 text-center">
      <div className="text-err font-semibold text-lg mb-2">
        Wrong network
      </div>
      <p className="text-text/80 mb-4">
        This is a prototype. Please switch to <span className="font-mono">HeLa Testnet</span>{" "}
        (chain {HELA_TESTNET_ID}) or <span className="font-mono">Hardhat Localhost</span>{" "}
        (chain {LOCALHOST_ID}) to continue. Mainnet connections are refused.
      </p>
      <div className="flex gap-2 justify-center">
        <button
          className="rounded-md bg-accent px-4 py-2 font-semibold text-white"
          onClick={() => switchChain({ chainId: LOCALHOST_ID })}
          disabled={isPending}
        >
          {isPending ? "Switching…" : "Switch to Localhost"}
        </button>
        <button
          className="rounded-md border border-accent px-4 py-2 font-semibold text-accent"
          onClick={() => switchChain({ chainId: HELA_TESTNET_ID })}
          disabled={isPending}
        >
          Switch to HeLa Testnet
        </button>
      </div>
    </div>
  );
}
