"use client";

import { useAccount } from "wagmi";
import { ChainGuard } from "@/components/ChainGuard";
import { DeployVaultButton } from "@/components/DeployVaultButton";
import { FundVaultCard } from "@/components/FundVaultCard";
import Link from "next/link";

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <section className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Onchain Agents</h1>
        <p className="text-muted mt-2 max-w-xl">
          Describe an agent in plain English. It runs autonomously on HeLa testnet,
          executes on your rules, and you keep the keys the whole time.
        </p>
      </section>

      <ChainGuard>
        {!isConnected ? (
          <div className="rounded-lg border border-line bg-panel p-8 text-center">
            <div className="text-text/80">
              Connect a wallet on HeLa testnet to deploy your first agent.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-lg border border-line bg-panel p-6">
              <div className="text-sm text-muted uppercase tracking-wide mb-2">Step 1</div>
              <h2 className="text-xl font-semibold mb-1">Deploy your vault</h2>
              <p className="text-text/70 mb-4 text-sm">
                A per-user contract you own. It holds your mock tokens, only you can
                withdraw. Agents are authorized against this vault with finite
                spending caps.
              </p>
              <DeployVaultButton />
            </section>

            <section className="rounded-lg border border-line bg-panel p-6">
              <div className="text-sm text-muted uppercase tracking-wide mb-2">Step 2</div>
              <h2 className="text-xl font-semibold mb-1">Fund it</h2>
              <p className="text-text/70 mb-4 text-sm">
                Get mock tokens from the{" "}
                <Link href="/faucet" className="underline decoration-accent">
                  faucet
                </Link>
                , then deposit into your vault. Everything is testnet-only mock.
              </p>
              <FundVaultCard />
            </section>

            <section className="rounded-lg border border-line bg-panel p-6">
              <div className="text-sm text-muted uppercase tracking-wide mb-2">Step 3</div>
              <h2 className="text-xl font-semibold mb-1">Describe an agent</h2>
              <p className="text-text/70 mb-4 text-sm">
                Tell the system what you want in English. An LLM CLI parses it into a
                typed on-chain intent and the runtime starts executing automatically.
              </p>
              <Link
                href="/new"
                className="inline-block rounded-md bg-accent px-5 py-3 font-semibold text-white hover:bg-accent/90"
              >
                Create an agent →
              </Link>
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
