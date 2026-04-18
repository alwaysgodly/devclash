"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { HELA_TESTNET_ID } from "@/lib/chains";

/// Wraps children. If the connected wallet is on a chain other than HeLa testnet,
/// shows a clear error and a switch button; children don't render.
export function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected) return <>{children}</>;
  if (chainId === HELA_TESTNET_ID) return <>{children}</>;

  return (
    <div className="mx-auto max-w-xl mt-16 rounded-lg border border-err/50 bg-err/10 p-6 text-center">
      <div className="text-err font-semibold text-lg mb-2">
        Wrong network
      </div>
      <p className="text-text/80 mb-4">
        This is a prototype. Please switch to <span className="font-mono">HeLa testnet</span>{" "}
        (chain id {HELA_TESTNET_ID}) to continue. Mainnet connections are refused.
      </p>
      <button
        className="rounded-md bg-accent px-4 py-2 font-semibold text-white"
        onClick={() => switchChain({ chainId: HELA_TESTNET_ID })}
        disabled={isPending}
      >
        {isPending ? "Switching…" : "Switch to HeLa testnet"}
      </button>
    </div>
  );
}
