"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import Link from "next/link";
import { ChainGuard } from "@/components/ChainGuard";
import { addresses, isAddressSet } from "@/lib/addresses";
import { erc20Abi, mockOracleAbi } from "@/lib/abi";

type Token = { label: string; symbol: string; address: `0x${string}` };

function MintRow({ token, to }: { token: Token; to: `0x${string}` }) {
  const [amount, setAmount] = useState("100");
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || isLoading;

  if (!isAddressSet(token.address)) {
    return (
      <div className="text-sm text-muted">
        {token.symbol} — not deployed (set NEXT_PUBLIC_MOCK_*_ADDR)
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 font-mono text-sm">{token.symbol}</div>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-32 rounded-md border border-line bg-bg px-3 py-2 text-sm"
      />
      <button
        disabled={busy || !amount || Number(amount) <= 0}
        onClick={() =>
          writeContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "mint",
            args: [to, parseEther(amount)],
          })
        }
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:bg-muted"
      >
        {busy ? "Minting…" : `Mint ${amount} ${token.symbol}`}
      </button>
    </div>
  );
}

function PriceRow({ token }: { token: Token }) {
  const [price, setPrice] = useState("10");
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || isLoading;

  if (!isAddressSet(token.address) || !isAddressSet(addresses.oracle)) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 font-mono text-sm">{token.symbol}</div>
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-32 rounded-md border border-line bg-bg px-3 py-2 text-sm"
      />
      <button
        disabled={busy || !price || Number(price) <= 0}
        onClick={() =>
          writeContract({
            address: addresses.oracle,
            abi: mockOracleAbi,
            functionName: "setPrice",
            args: [token.address, parseEther(price)],
          })
        }
        className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent disabled:opacity-50"
      >
        {busy ? "Setting…" : `Set ${token.symbol} = $${price}`}
      </button>
    </div>
  );
}

export default function Faucet() {
  const { address, isConnected } = useAccount();

  const tokens: Token[] = [
    { label: "Mock USD", symbol: "mUSD", address: addresses.mUSD },
    { label: "Mock Token A", symbol: "mTKA", address: addresses.mTKA },
    { label: "Mock Token B", symbol: "mTKB", address: addresses.mTKB },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <div className="text-sm text-muted"><Link href="/" className="hover:text-text">← Home</Link></div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Faucet & price controls</h1>
          <p className="text-muted text-sm mt-2 max-w-lg">
            Mint prototype tokens to your wallet and set mock oracle prices to drive
            agent conditions during the demo.
          </p>
        </div>
        <ConnectButton showBalance={false} />
      </div>

      <ChainGuard>
        {!isConnected ? (
          <div className="rounded-lg border border-line bg-panel p-8 text-center text-text/80">
            Connect a wallet first.
          </div>
        ) : (
          <div className="space-y-8">
            <section className="rounded-lg border border-line bg-panel p-6">
              <h2 className="text-lg font-semibold mb-4">Mint mock tokens</h2>
              <div className="space-y-3">
                {tokens.map((t) => (
                  <MintRow key={t.symbol} token={t} to={address as `0x${string}`} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-panel p-6">
              <h2 className="text-lg font-semibold mb-1">Set mock prices</h2>
              <p className="text-sm text-muted mb-4">
                Prices are USD/token with 18 decimals. Triggering a price change here is
                what fires stop-losses and conditional transfers during a demo.
              </p>
              <div className="space-y-3">
                {tokens.map((t) => (
                  <PriceRow key={t.symbol} token={t} />
                ))}
              </div>
            </section>
          </div>
        )}
      </ChainGuard>
    </div>
  );
}
