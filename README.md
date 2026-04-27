# Onchain Agents — DevClash 2026 PS 02

> ⚠️ **PROTOTYPE ONLY.** HeLa testnet / local hardhat node only. All tokens
> (mUSD / mTKA / mTKB) and the price oracle are mocks. Do not connect a wallet
> that holds real assets.

Natural-language onchain agents with a **non-custodial per-user vault** and
**finite spending caps**. You describe an agent in plain English, an LLM CLI
(Gemini by default, Claude as an alternative) parses it into a typed on-chain
intent, and a Node.js runtime watches the chain and executes it while you keep
the keys the whole time.

Three reference intent types:

- **DCA + stop-loss** — interval token swaps with a price-drop safety net
- **Conditional transfer** — one-shot transfer when an oracle price crosses a threshold
- **Recurring transfer** — transfer on a time interval with an optional max count

---

## TL;DR for judges — run it locally in one command

**Prerequisites** (install these first, then come back):

1. **Node 18+** — `node --version` must print `v18` or newer
2. **MetaMask** browser extension
3. **An LLM CLI** — the runtime spawns `gemini -p …` (default) or `claude -p …` as a subprocess to parse intents and narrate each execution. Pick one:

   **Gemini CLI (default — set `LLM_PROVIDER=gemini` in `agent-runtime/.env`, or leave unset):**
   ```bash
   npm install -g @google/gemini-cli
   gemini          # first run prompts for Google OAuth in a browser
   ```
   Or set `GEMINI_API_KEY` in `agent-runtime/.env` to skip the OAuth step.

   **Claude Code CLI (alternative — set `LLM_PROVIDER=claude` in `agent-runtime/.env`):**
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude login    # opens a browser, sign in with your Claude.ai account
   ```

   *Skipping this step entirely:* the app still launches, but every "Parse intent" click and every runtime decision step will fail with a CLI-not-found error surfaced in the UI.

**Then, one command from the repo root:**

```bash
npm run demo
```

That script (`scripts/start-local.sh`) does all of the following so you don't have to:

- installs npm deps in `/`, `/agent-runtime`, and `/frontend` if missing
- seeds `agent-runtime/.env` and `frontend/.env.local` with the deterministic localhost contract addresses
- starts a **hardhat node** on `:8545` (logs → `logs/hardhat.log`)
- runs all three deploy scripts against localhost (mocks → core → executors)
- starts the **agent runtime** on `:7777` (logs → `logs/runtime.log`)
- starts the **Next.js frontend** on `:3000` (logs → `logs/frontend.log`)
- prints the MetaMask setup values you need

`Ctrl-C` in the terminal running `npm run demo` cleans up all three background processes.

### MetaMask setup (one-time)

1. **Add network:**
   - Name: `Hardhat Localhost`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`
2. **Import account** using the Hardhat default account #0 private key:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
   This is a well-known public test key — safe to paste on a localhost-only chain. **Never reuse it on a real network.**

### Demo walkthrough

Open `http://localhost:3000` and connect MetaMask.

1. **Home → Step 1:** click **Deploy my agent vault**. Your per-user vault contract is created.
2. **Home → Step 2 (or the Faucet tab):** mint yourself some mUSD, then Approve + Deposit into your vault. The Dashboard's Token balances card will show wallet → vault transfer.
3. **Home → Step 3:** click **Create an agent**. On the `/new` page pick one of the natural-language presets (or type your own), then click **Parse intent** → **Register intent** → **Approve cap**. All three steps.
4. **Dashboard:** watch the Executions counter tick up and mUSD flow out of the vault into mTKA. Click **Explain →** on an intent to see every LLM-narrated decision with the prompt and raw response.
5. **Test the kill switch:** Pause, Resume, Revoke vault, Deactivate, Emergency withdraw — all one click, all bypass the agent.
6. **Trigger a stop-loss:** on the Faucet page, set mTKA price to $1 (was $10). The DCA intent detects the drop on its next cycle, fires stop-loss, and the Dashboard flips to `Stopped (stop-loss)` with a red banner.

---

## If `npm run demo` isn't convenient — 4 terminals manually

```bash
# Terminal 1 — hardhat chain (leave running)
npx hardhat node

# Terminal 2 — deploy contracts (rerun each time hardhat restarts)
npm run deploy:local

# Terminal 3 — agent runtime
cd agent-runtime && npm install && node index.js

# Terminal 4 — frontend
cd frontend && npm install && npm run dev
```

First-time only: copy `.env.example` / `.env.local.example` and fill in the deterministic localhost addresses, or just run `npm run demo` once (which seeds them) then switch to manual mode.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Home page shows a green ✓ Vault but "Deploy my agent vault" tx's `gasUsed` is only `21160` | Hardhat node was restarted without redeploying contracts | Rerun `npm run deploy:local` |
| `/new` page shows `Failed to fetch` on Parse intent | Runtime not running on `:7777`, or `NEXT_PUBLIC_RUNTIME_URL` wrong | Check `logs/runtime.log`, verify `http://localhost:7777/health` responds |
| Every `execute-error` shows `cannot estimate gas` with `revert reason: Vault: inactive` | Intent was registered but **Approve cap** was never clicked on `/new` | Dashboard → Deactivate that intent, then create a fresh one and click both buttons |
| `cannot estimate gas` with `revert reason: ERC20: transfer amount exceeds balance` | Vault ran out of mUSD (or was never funded with mUSD specifically) | Faucet → mint mUSD → Home Step 2 → deposit into vault |
| Dashboard shows Executions going up but none are actual swaps | Runtime's `decide()` ran but `execute()` reverted; check the `revert reason` on `/explain/[id]` | Use the reason to diagnose — usually a balance or approval issue |
| Everything looks fine but Parse button errors with `gemini cli exit 127` (or `claude cli exit 127`) | The LLM CLI matching `LLM_PROVIDER` is not installed or not on PATH | See prerequisites above |

---

## Repo layout

```
contracts/core/             AgentVault, VaultFactory, IntentRegistry, IExecutor
contracts/core/executors/   DCAExecutor, ConditionalTransferExecutor, RecurringTransferExecutor
contracts/mocks/            MockERC20, MockOracle, MockDEX (prototype-only)
test/                       Hardhat tests (82 passing — unit + integration)
scripts/                    deploy-mocks, deploy-core, deploy-executors, start-local.sh
agent-runtime/              Node.js off-chain watcher + Claude CLI wrapper + HTTP server
frontend/                   Next.js 14 + RainbowKit + wagmi (home, new, dashboard, faucet, explain)
deployments/                Addresses keyed by network (written by deploy scripts)
docs/                       System diagram, disclaimers, runbook
```

## How it maps to PS 02

| # | Requirement | Implementation |
|---|---|---|
| 1 | Deploy autonomous agents | `VaultFactory.createVault()` + `IntentRegistry.registerIntent()` from the frontend |
| 2 | User-defined intents | English → `gemini -p` (or `claude -p`) → typed struct → `abi.encode` → on-chain |
| 3 | Autonomous execution on conditions | `agent-runtime/` polls, checks `canExecute`, asks the LLM to narrate, submits `execute(id, explanation)` |
| 4 | Monitoring + control | Dashboard: pause, resume, revoke, deactivate, emergency withdraw |
| 5 | Secure execution + permissioning | Non-custodial vault, per-intent cap, executor-scoped `pullForIntent`, ReentrancyGuard + CEI, nonce replay guard |
| 6 | Logs + explainability | JSONL log stream at `GET /logs`, rendered at `/explain/[id]` with full prompt + raw response |

## Architecture + non-custodial guarantee

See `docs/system-diagram.md` and `docs/prototype-disclaimers.md` for the detailed
story. Short version:

- Per-user `AgentVault` holds tokens. Only the vault owner can deposit, withdraw,
  pause, revoke, or `emergencyWithdraw`.
- Intents carry a finite token cap bound to a specific executor address. Even a
  malicious third-party executor cannot pull funds without being the registered one.
- The testnet dev key in the runtime can only call executor runners — it can
  never call vault mutators. Compromise blast radius ≤ sum of active intent caps.
- Revocation is one on-chain tx from the owner.

## Tests

```bash
npm install
npm run compile
npm run test    # expected: 82 passing
```

Coverage: vault access control (owner, wrong executor, cap enforcement,
pause/revoke, emergency withdraw with active intent), registry (duplicate id,
deactivate-only-by-owner, executor-only nonce bump), each executor's happy path
+ edges (interval, stop-loss boundary, double-execute, unknown intent, oracle
unset, insufficient balance), and an end-to-end integration test running all
three intent types against one vault concurrently.

## Security and prototype notes

- Contracts use OpenZeppelin 4.9.x (`Ownable`, `ReentrancyGuard`, `SafeERC20`). Solidity 0.8.9, checked math.
- The LLM CLI (`gemini` or `claude`) is spawned with `shell: false` and an explicit arg array — no shell interpolation of user input.
- LLM output is strictly schema-validated; unknown types, bad addresses, or out-of-range values are rejected. Prompt injection at worst makes parsing fail — it cannot cause unauthorized actions because all money-moving calls validate on-chain independent of LLM output.
- Runtime has a deterministic fallback: if the CLI times out, rate-limits, or returns non-JSON, the runtime executes the deterministic rule and logs the fallback. User intents never deadlock because of our LLM.
- Contracts are not audited. Do not fork for production.

## Contributors

See [CONTRIBUTORS.md](./CONTRIBUTORS.md).

## License

Prototype code for hackathon submission. Not for production use.
