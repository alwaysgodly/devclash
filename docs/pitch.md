# Pitch deck outline — 5 minute judge presentation

Use this for judge round 3 and the demo video narration. Trim to 3 minutes if
only the Q&A slot is 5 min.

## Slide 1 — Title + disclaimer (15s)
> **Onchain Agents on HeLa**
> Infrastructure for autonomous onchain agents with user-defined intents.
> ⚠️ Prototype only — HeLa testnet, mock tokens, mock oracle.

## Slide 2 — The problem, stated plainly (20s)
> PS 02: "Standardized infrastructure to securely deploy, manage, and monitor
> autonomous agents based on user-defined intents." Six mandatory requirements.
> The tension: **autonomy without giving up control**.

## Slide 3 — Our answer in one sentence (20s)
> A user deploys a **non-custodial vault**, describes what they want in English,
> and the system runs it forever — with finite caps, live monitoring, and
> receipt-grade explainability for every decision the AI makes.

## Slide 4 — The 6 requirements → our components (60s)
| PS req | Our build |
|---|---|
| Deploy agents | `VaultFactory.createVault()` → per-user vault |
| Define intents | NL textbox → Claude parses → typed on-chain struct |
| Autonomous exec | Node runtime polls every 15s, asks Claude to decide |
| Monitor + control | Dashboard with pause / revoke / emergency withdraw |
| Secure exec | Per-intent caps, executor-scoped pull, nonReentrant |
| Logs + explainability | Every cycle stores prompt+response+tx in JSONL |

## Slide 5 — What non-custodial really means here (30s)
> The vault is owned by you, lives at a per-user contract address, and the
> only way funds move is through `pullForIntent` — which validates caller,
> cap, active flag, pause flag. The off-chain dev key can call executor
> runners; it cannot touch the vault directly. Revocation is one transaction.

## Slide 6 — Three reference intent types (60s)
1. **DCA + stop-loss** — "buy $10 of mTKA every 30s, stop if it drops 20%"
2. **Conditional transfer** — "when mTKB hits $12, send 100 mUSD to 0xABC"
3. **Recurring transfer** — "every minute send 20 mUSD to roommate, up to 5x"

All three sit on the same vault + registry + `IExecutor` pattern. Adding a
fourth type is ~80 lines of Solidity + one prompt addendum.

## Slide 7 — Live demo (90s)
_Switch to browser. Fresh wallet, follow `docs/running-the-demo.md` flow 1–4._

## Slide 8 — Explainability (30s)
> For every execution cycle we log: the exact prompt Claude saw, the raw
> response, the deterministic condition that triggered the cycle, and the
> resulting transaction hash. You can audit any single decision after the
> fact. If Claude is unavailable, a deterministic fallback executes and is
> clearly marked — user funds never deadlock because of our LLM.

## Slide 9 — What would change for production (30s)
> Three things: (1) The dev key becomes an ERC-4337 session key. (2) The
> runtime moves to a TEE or a threshold-sig cluster. (3) Mocks get replaced
> with Chainlink / Cytoswap / real ERC20s. The contract architecture doesn't
> change — the executor interface is the stable boundary.

## Slide 10 — What we'd build next (15s)
> - More executor types: liquid staking, governance voting, NFT drops
> - Agent-to-agent negotiation via intent chaining
> - On-chain reputation for executor contracts

## Slide 11 — Ask (10s)
> Code: `github.com/…`
> Live demo: `…vercel.app`
> PR: `HelaNetwork/NetworkProjects#…`
> Thanks.

---

## Q&A cheat sheet (short answers)

- **"How is it non-custodial if there's an off-chain runtime?"** Dev key can only call executor runners. Blast radius ≤ sum of active intent caps. Owner can revoke / emergency withdraw anytime.
- **"Why three executors?"** Separation of concerns. Each is ~80-100 LOC, trivial to audit. A bug in DCA doesn't touch Recurring.
- **"Replay protection?"** Registry stores a per-intent nonce. Executor is the only caller that can bump it.
- **"What about Claude going down / rate-limited?"** Deterministic fallback executes with a canned explanation, flagged in the log. Never deadlocks.
- **"Prompt injection?"** Parser output is strictly schema-validated. Worst case: intent parsing fails. Never causes unauthorized actions because money-moving calls validate on-chain independently.
- **"Gas on HeLa?"** Testnet HLUSD from the official faucet. Production would bill per execution; infinitely cheap at prototype scale.
- **"Upgradability?"** Contracts are not upgradable by design — prototype; production would use transparent proxies with vault-owner veto.
- **"What if multiple agents compete for the same vault funds?"** Caps are per-intent. If total caps exceed balance, the first executor to run gets filled; the next gets "Vault: cap exceeded" from pullForIntent. User tunes caps.
