"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ChainGuard } from "@/components/ChainGuard";
import { DeployVaultButton } from "@/components/DeployVaultButton";
import Link from "next/link";

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Onchain Agents</h1>
          <p className="text-muted mt-2 max-w-lg">
            Describe an agent in plain English. It runs autonomously on HeLa testnet,
            executes on your rules, and you keep the keys.
          </p>
        </div>
        <ConnectButton showBalance={false} />
      </div>

      <ChainGuard>
        {!isConnected ? (
          <div className="rounded-lg border border-line bg-panel p-8 text-center">
            <div className="text-text/80 mb-4">
              Connect a wallet on HeLa testnet to deploy your first agent.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-lg border border-line bg-panel p-6">
              <div className="text-sm text-muted uppercase tracking-wide mb-2">Step 1</div>
              <h2 className="text-xl font-semibold mb-1">Deploy your vault</h2>
              <p className="text-text/70 mb-4 text-sm">
                Your vault is a per-user contract you own. It holds your mock tokens and
                only you can withdraw. Agents are authorized against this vault with
                finite spending caps.
              </p>
              <DeployVaultButton />
            </section>

            <section className="rounded-lg border border-line bg-panel p-6">
              <div className="text-sm text-muted uppercase tracking-wide mb-2">Step 2</div>
              <h2 className="text-xl font-semibold mb-1">Fund it</h2>
              <p className="text-text/70 mb-4 text-sm">
                Use the faucet to mint prototype mUSD / mTKA / mTKB directly to your
                wallet, then deposit into your vault.
              </p>
              <Link
                href="/faucet"
                className="inline-block rounded-md border border-line bg-bg px-4 py-2 text-sm font-medium hover:border-accent"
              >
                Open faucet →
              </Link>
            </section>

            <section className="rounded-lg border border-line bg-panel p-6 opacity-60">
              <div className="text-sm text-muted uppercase tracking-wide mb-2">Step 3</div>
              <h2 className="text-xl font-semibold mb-1">Describe an agent</h2>
              <p className="text-text/70 text-sm">
                Coming in the next build phase — natural-language intents parsed by Claude
                into structured on-chain params.
              </p>
            </section>
          </div>
        )}
      </ChainGuard>

      <footer className="mt-16 text-xs text-muted text-center">
        DevClash 2026 PS 02 submission · HeLa testnet (chain 666888) · prototype only
      </footer>
    </div>
  );
}
