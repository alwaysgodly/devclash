# System Diagram

For judge round 1 (5 PM Apr 18) — architecture walkthrough.

## Layered view

```
                      [ HeLa TESTNET — chain 666888 ]
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  CORE (production-relevant)         MOCKS (prototype only)            │
│  ─────────────────────────          ──────────────────────────        │
│  VaultFactory  ──────┐              MockUSD / MockTKA / MockTKB       │
│                      ▼              (public mint for self-serve)      │
│                AgentVault ◀──owner──┐                                 │
│                (per user)           │  MockOracle (owner-settable)    │
│                • deposit / withdraw │                                 │
│                • approveIntent      │  MockDEX (deterministic         │
│                • setPaused          │          swap at oracle price)  │
│                • revokeIntent       │                                 │
│                • pullForIntent      │  [In prod: real ERC20s,         │
│                • emergencyWithdraw  │   Chainlink/Pyth, Cytoswap]     │
│                      ▲              │                                 │
│                      │ pulls funds (capped, executor-scoped)          │
│                      │                                                │
│                ┌─────┴──────┐ ┌──────────────┐ ┌────────────────┐     │
│                │    DCA     │ │  Conditional │ │   Recurring    │     │
│                │  Executor  │ │  Xfer Exec   │ │   Xfer Exec    │     │
│                └────────────┘ └──────────────┘ └────────────────┘     │
│                      ▲                                                │
│                      │ reads active intents / bumps nonce             │
│                IntentRegistry                                         │
│                (id → {owner, vault, executor, params, active, nonce}) │
└───────────────────────────────────────────────────────────────────────┘
          ▲                                        ▲
          │ write intents                          │ execute tx
          │                                        │ (testnet dev key)
──────────┼────────────────────────────────────────┼─────────────────────
          │                                        │
┌──────────────────────┐               ┌───────────────────────────────┐
│  Frontend (Vercel)   │               │  Agent Runtime (team laptop)  │
│  Next.js +           │               │  Node.js                      │
│  RainbowKit          │               │                               │
│                      │──NL text─────▶│  every 15s:                   │
│  • NL intent form    │               │   1. read intents from chain  │
│  • Dashboard         │               │   2. check condition          │
│  • Kill-switch       │◀──logs.jsonl──│   3. LLM CLI (`gemini -p` or  │
│                      │               │      `claude -p`) decide+     │
│  • Explain tab       │               │      explain                  │
│  • Faucet + prices   │               │   4. submit tx                │
└──────────────────────┘               │   5. append structured log    │
          ▲                            └───────────────────────────────┘
          │                                        ▲
     user wallet                                   │
   (owns vault; retains                [ Production: session keys,      │
    ultimate control;                    TEE runtime, threshold sig —   │
    emergencyWithdraw                    prototype uses a local dev     │
    at any time)                         key that can only call         │
                                         executor runners, never        │
                                         vault mutators directly ]       │
```

## How the 6 PS 02 requirements land on this diagram

1. **Deploy agents** — `VaultFactory.createVault()` + `IntentRegistry.registerIntent()`.
2. **Define intents** — frontend NL text → LLM CLI (`gemini -p` or `claude -p`) parses into a typed params
   struct → `IntentRegistry.registerIntent(id, vault, executor, abi.encode(params))`.
3. **Autonomous execution** — the agent runtime's 15s cycle; no user action required
   between intent creation and execution.
4. **Monitoring + control** — dashboard lists intents + live status; controls:
   `setPaused`, `revokeIntent`, `deactivate`, `emergencyWithdraw`.
5. **Secure execution + permissioning** — non-custodial vault, per-intent cap,
   executor-scoped `pullForIntent` (msg.sender check), `nonReentrant` +
   check-effects-interactions, `bumpNonce` gated to the registered executor.
6. **Logs + explainability** — every cycle appends a JSONL record
   `{ts, intent_id, condition, prompt, llm_response, reason, tx_hash}` surfaced
   in the Explain tab.

## Non-custodial property (ask-me-anything for judges)

- Only the vault **owner** can `deposit`, `withdraw`, `approveIntent`, `setPaused`,
  `revokeIntent`, or `emergencyWithdraw`.
- Approved intents get a **finite token cap** and are bound to a **specific executor
  address**. A malicious third-party contract cannot pull funds even if it knows
  the intent id.
- `pullForIntent` requires `msg.sender == approvals[id].executor`, and validates
  active + not paused + cap not exceeded.
- The dev key signing txs on the team laptop has **no path** into the vault directly.
  It calls executor `execute(id, explanation)`, which in turn calls
  `vault.pullForIntent(...)` — validated end-to-end.
- `emergencyWithdraw(token)` returns all of a token's balance to the owner in one
  tx, overriding any active intent.
- Compromise blast radius of the laptop dev key ≤ the sum of active intent caps.
  Revocation is one tx from the owner.

## Mocks → production (ask-me-anything #2)

| Mock | Prototype reason | Production |
|---|---|---|
| MockERC20 with public `mint` | Judges self-serve via `/faucet` | Real ERC20s |
| MockOracle owner-settable | Demo controls price on demand | Chainlink / Pyth / TWAP |
| MockDEX (mint on swap) | Zero liquidity management | Cytoswap (Uniswap V3 fork) |
| Dev key on laptop | LLM CLI auth (`gemini` or `claude`) is local | Session keys (ERC-4337), TEE, threshold sig |
| Seconds-based intervals | Demo compressed from days to seconds | Day/week intervals |
