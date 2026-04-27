# Prototype disclaimers

This codebase is a 24-hour hackathon prototype submitted to DevClash 2026 (PS 02). It
is **not** production software. The items below are intentional prototype shortcuts
that must be replaced before any real-world use.

## What is mocked

| Mock | Prod replacement |
|---|---|
| `MockERC20` (mUSD, mTKA, mTKB) with public `mint` | Real ERC20s (stablecoins, project tokens) |
| `MockOracle` with owner-settable price | Chainlink / Pyth / on-chain TWAP |
| `MockDEX` with deterministic zero-fee swap at oracle price | Cytoswap (Uniswap V3 fork on HeLa) or other AMM |
| Second-based intent intervals (e.g. every 30s DCA) | Day/week intervals for real personal finance |
| Agent runtime on a team laptop with an LLM CLI authenticated (`gemini` by default, or `claude`) | TEE / secure enclave / managed runtime with session keys or threshold signing |
| Single dev key signing txs | Per-user session keys via account abstraction (ERC-4337), MPC, or threshold signing |

## Why none of this touches real money

1. The app is gated to HeLa testnet (chain 666888); the frontend refuses mainnet
   connections.
2. Every token in the UI carries an `m` prefix (mUSD, mTKA, mTKB) to visually mark it
   as mock.
3. The mock oracle is owner-settable and not wired to any real price feed — judges
   and demo viewers control it via the `/faucet` page.
4. The mock DEX settles at oracle price with zero fees — there is no liquidity to
   drain, no MEV surface, no external dependency.
5. Gas is paid in testnet HLUSD from the HeLa faucet.

## Non-custodial guarantee

The user retains ultimate control because:

- Only the vault owner can deposit, withdraw, pause intents, revoke intents, or call
  `emergencyWithdraw`.
- Each intent has a finite token cap enforced by the vault.
- Executor contracts can only call `vault.pullForIntent(id, amount, to)`, which the
  vault validates against the registry (caller is the registered executor, intent is
  active, cap not exceeded, not paused).
- The dev key signing txs on the team laptop has no path to call vault mutators
  directly — it can only call executors' `execute(id)` runners, which themselves
  validate.
- `emergencyWithdraw(token)` returns all of a token's balance to the owner in one
  tx, regardless of active intents.

## Production roadmap (aspirational, not implemented)

- Replace the dev key with ERC-4337 session keys issued per intent, capped by the
  same vault approvals.
- Move the agent runtime to a TEE (e.g. AWS Nitro Enclaves, Intel SGX) so the signing
  key is not exposed on a laptop.
- Integrate real oracles and DEX routes.
- Add per-intent spending windows (rate limits per hour, not just total caps).
- Add multi-signer override (e.g. DAO can pause if the runtime misbehaves).
- Support account abstraction bundlers on HeLa when they become available.
