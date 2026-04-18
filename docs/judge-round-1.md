# Judge round 1 — 5 PM Apr 18 — system design review

## 3-minute opening (the presenter reads these)

> "We're building **Infrastructure for Autonomous Onchain Agents** on HeLa testnet.
> PS 02 asks for six things: deploy agents, define intents, autonomous execution,
> monitoring and control, secure non-custodial execution, and logs/explainability.
> We shipped one framework that hits all six, with three reference intent types
> coming on top: DCA + stop-loss, conditional transfers, and recurring transfers.
> Everything on screen today is **prototype only** — mock tokens, mock oracle,
> testnet-only dev key. No real funds at any layer."

## Key talking points (in priority order)

1. **Non-custodial by construction.** Per-user `AgentVault`. Owner-gated deposit,
   withdraw, pause, revoke, emergencyWithdraw. Intents get finite token caps bound
   to specific executor addresses.

2. **Natural-language intents.** A user types "DCA 50 mUSD into mTKA every 30s,
   stop at -20%." The frontend calls `claude -p` with a strict schema prompt; the
   parsed struct is `abi.encode`'d and registered on-chain. Judges can test this
   live on the demo URL.

3. **Autonomous runtime with explainability baked in.** A Node.js process polls the
   registry every 15 seconds. For every execution cycle, it calls `claude -p` with
   the intent state and asks for a decide+explain response. Every prompt + response
   + resulting tx is logged to JSONL and surfaced in the Explain tab. This
   directly addresses PS 02's explainability requirement — not as a retrofit, but
   as the main reasoning path.

4. **Prototype-honest boundary.** Everything with an `m` prefix or a "MOCK" label
   is mock. Oracle is owner-settable so we can trigger conditions on demand. DEX
   settles at oracle price with zero fees. We explicitly document what gets
   replaced in production (Chainlink, Cytoswap, ERC-4337 session keys, TEE).

## Anticipated questions + prepared answers

| Question | Answer |
|---|---|
| "How is this non-custodial if an off-chain process signs txs?" | The dev key can only call **executor runners** (`execute(id, explanation)`), never vault mutators. Its blast radius is capped by the sum of active intent caps, and the vault owner can `revokeIntent` or `emergencyWithdraw` in one tx. In production this key becomes a session key via ERC-4337 with the same capped scope. |
| "Why three executors instead of one big one?" | Separation of concerns + smaller security surface. Each executor is ~80-100 LOC, trivial to audit. A bug in DCA doesn't affect Recurring. Each is registered against the vault independently. |
| "What if Claude is down / rate-limited?" | The runtime falls back to a deterministic "condition met → execute" rule with a canned "LLM unavailable: deterministic fallback" explanation. User intents never deadlock. |
| "What stops someone from registering a malicious executor and pulling funds?" | The user's `approveIntent` call on the vault names the executor contract address. The vault only honors `pullForIntent` if `msg.sender == approvals[id].executor`. The user (via our trusted frontend) only ever points at authoritative executor addresses. |
| "Replay protection?" | Registry stores a nonce per intent. Each `execute` bumps the nonce. The executor is the only caller allowed to bump. Stale tx submissions are idempotent with respect to the registry state. |
| "Why mocks everywhere?" | Hackathon prototype rule: no real money involvement. Mocks let judges self-serve tokens and manipulate oracle prices to trigger demo conditions in seconds instead of days. |
| "Is this the actual architecture you'd ship?" | The contracts are. The off-chain runtime would move to a TEE with session-key signing and a managed queue. The intent parsing + decide/explain model is the production model — we just use Claude via CLI locally because we don't want to provision an API key for a prototype. |

## What we're showing live

1. Connect wallet on HeLa testnet (chain 666888). Wrong-network guard refuses mainnet.
2. Prototype banner visible top-of-page.
3. `/faucet` page mints mUSD/mTKA/mTKB on demand; oracle price controls visible.
4. Home page "Deploy my agent vault" button → reads `vaultOf(user)` after mining.
5. (If DCA is wired by 5 PM) NL intent creation + first execution visible in logs.

## What's still in progress (honest)

- Executor contracts: DCA in flight, Conditional + Recurring queued.
- Agent runtime: skeleton in flight.
- Full E2E demo video: draft after judge round 2.

## Safe-harbor plan

Branch `safe-harbor-v1` cut at h12 = Vault + DCA + monitoring + explainability all
working. If anything breaks after h17 we fall back to that branch and demo the
single-intent version.
