# Onchain Agents — DevClash 2026 PS 02

> ⚠️ **PROTOTYPE — HeLa testnet only. No real funds. All tokens and oracles are mocks.**
> Do not connect a wallet holding real assets. The agent runtime uses a testnet-only
> dev key; production would use session keys (ERC-4337), a TEE, or threshold
> signing — this prototype's signing model is not production-ready.

Infrastructure for deploying and managing autonomous onchain agents that execute
user-defined intents on the HeLa blockchain. The prototype ships three reference
intent types on top of a non-custodial per-user "guarded-box" vault:

- **DCA + stop-loss** — interval swaps with price-drop safety
- **Conditional transfer** — one-shot transfer when an oracle price crosses a threshold
- **Recurring transfer** — transfer on a time interval, with an optional max count

Natural-language intents are parsed into typed on-chain params by the local
`claude` CLI. A Node.js runtime watches the on-chain registry, asks Claude to
decide + explain each execution cycle, submits the tx, and logs the prompt,
response, and tx hash for auditability.

## How it maps to PS 02's six requirements

| # | Requirement | Implementation |
|---|---|---|
| 1 | Deploy autonomous agents | `VaultFactory.createVault()` + `IntentRegistry.registerIntent()` from the frontend |
| 2 | User-defined intents | Natural-language text → `claude -p` → strict typed struct → `abi.encode` → on-chain |
| 3 | Autonomous execution on conditions | `agent-runtime/` polls every 15s, checks `canExecute`, asks Claude to decide + explain, submits `execute(id, explanation)` |
| 4 | Monitoring + control | `/dashboard` lists intents. Buttons: pause, unpause, revoke (vault side), deactivate (registry side), `emergencyWithdraw` |
| 5 | Secure execution + permissioning | Non-custodial vault (owner-gated), per-intent token cap, executor-scoped `pullForIntent` with reentrancy guard + CEI, nonce replay protection, separate ownership of vault vs. executor |
| 6 | Logs + explainability | Every cycle writes `{ts, intentId, prompt, llm_response, reason, tx_hash}` to JSONL. Surfaced at `/explain/[id]` |

## Repository layout

```
contracts/core/       AgentVault, VaultFactory, IntentRegistry, IExecutor
contracts/core/executors/  DCAExecutor, ConditionalTransferExecutor, RecurringTransferExecutor
contracts/mocks/      MockERC20, MockOracle, MockDEX (prototype-only)
test/                 Hardhat tests (82 passing — contracts + integration)
scripts/              deploy-mocks, deploy-core, deploy-executors, mint-demo
agent-runtime/        Node.js off-chain watcher + `claude` CLI subprocess wrapper
frontend/             Next.js + RainbowKit + wagmi UI (home, new, dashboard, faucet, explain)
deployments/          Contract addresses keyed by network name (written by deploy scripts)
docs/                 System diagram, prototype disclaimers, judge-round notes, runbook
```

## Quick start (local dev — for judges who want to run everything)

```bash
# Prerequisites: Node 18+, claude CLI authenticated, a fresh MetaMask on HeLa testnet

npm install
npm run compile
npm run test           # sanity: 82 passing

cp .env.example .env   # paste a testnet dev key (never a mainnet key)

npm run deploy:mocks
npm run deploy:core
npm run deploy:executors
npm run mint:demo

# In a separate terminal:
cd agent-runtime
cp .env.example .env   # copy addresses from deployments/helaTestnet.json
npm install
node index.js          # agent + HTTP server on :7777

# In another terminal:
cd frontend
cp .env.local.example .env.local   # copy addresses into NEXT_PUBLIC_* vars
npm install
npm run dev            # http://localhost:3000
```

Full end-to-end walkthrough with per-step expectations lives in
`docs/running-the-demo.md`.

## Deployment addresses (HeLa testnet)

_Populated after running the deploy scripts. These reflect the exact instance
the demo URL and video are pointed at._

```
MockUSD (mUSD):                _TBD_
MockTKA:                       _TBD_
MockTKB:                       _TBD_
MockOracle:                    _TBD_
MockDEX:                       _TBD_
VaultFactory:                  _TBD_
IntentRegistry:                _TBD_
DCAExecutor:                   _TBD_
ConditionalTransferExecutor:   _TBD_
RecurringTransferExecutor:     _TBD_
```

## Example transaction hashes

_Populated after a live walkthrough — three txs covering the core flows:_

- DCA execution (swap mUSD → mTKA with Claude explanation): `_TBD_`
- Stop-loss trigger after oracle price drop: `_TBD_`
- Conditional transfer fired when price crossed threshold: `_TBD_`

## Architecture + non-custodial guarantee

See `docs/system-diagram.md` for the ASCII architecture and
`docs/prototype-disclaimers.md` for what is mocked vs. what production would
replace. Short version:

- Per-user `AgentVault` holds tokens. Only the vault owner can deposit, withdraw,
  pause, revoke, or `emergencyWithdraw`.
- Intents get finite token caps bound to a specific executor address. A
  malicious third-party executor cannot pull funds even if it knows the intent id.
- The testnet dev key that signs txs on the team laptop can only call executor
  runners, never vault mutators directly. Compromise blast radius ≤ sum of
  active intent caps.
- Revocation is one tx from the owner.

## Tests

```bash
npm run test
```

Expected: **82 passing**. Coverage includes vault access control (owner, wrong
executor, cap enforcement, pause/revoke, emergency withdraw with active
intent), registry (duplicate id, deactivate-only-by-owner, nonce gated to
executor), each executor's happy paths + edge cases (interval, stop-loss
boundary, double-execute, unknown intent, oracle unset, insufficient balance),
and an end-to-end integration test running three intent types against one vault
concurrently.

## Submission deliverables (PS 02 checklist)

- [x] Public GitHub repo with README + code + tests
- [x] Hardhat contracts + 82 tests
- [x] Frontend (Next.js + RainbowKit + wagmi)
- [ ] Deployment addresses (HeLa testnet) — populated after deploy
- [ ] 3 example tx hashes — populated during walkthrough
- [ ] Live demo URL (Vercel) — populated after deploy
- [ ] Demo video ≤ 5 min — recorded in final hours
- [ ] PR to HelaNetwork/NetworkProjects — submitted before 10 AM deadline

## Security and prototype notes

- Contract safety relies on OpenZeppelin 4.9.x (`Ownable`, `ReentrancyGuard`,
  `SafeERC20`). Solidity 0.8.9, checked math.
- NL input to Claude is interpolated into a prompt with triple-quote escaping;
  parsed output is strictly schema-validated (unknown types, bad addresses,
  out-of-range values → rejected). Prompt injection can at worst make parsing
  fail — it cannot cause unauthorized actions because all money-moving calls
  validate on-chain independent of any LLM output.
- `claude` subprocess is invoked with `shell: false` and explicit arg array —
  no shell interpolation.
- Runtime deterministic fallback: if the CLI times out, rate-limits, or returns
  non-JSON, the runtime executes the deterministic rule and logs the fallback.
  User intents never deadlock because of our LLM.
- Contract code is not audited. Do not fork for production.

## License

Prototype code for hackathon submission. Not for production use.
