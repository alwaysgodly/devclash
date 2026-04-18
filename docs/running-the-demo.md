# Running the demo — team runbook

End-to-end steps to get a working demo running on HeLa testnet. Expected total
time: ~15 minutes once a funded dev wallet exists.

## 1. Fresh dev wallet + HLUSD for gas

1. Generate a new wallet (never reuse a mainnet key).
2. Add HeLa testnet to MetaMask (one-time):
   - Network name: `HeLa Testnet`
   - RPC: `https://testnet-rpc.helachain.com`
   - Chain ID: `666888`
   - Currency: `tHLUSD`
3. Hit the HeLa faucet and request testnet HLUSD for this wallet. This is gas.

## 2. Populate `.env`

```bash
cp .env.example .env
# edit .env, set DEPLOYER_PRIVATE_KEY to the new wallet's key
```

## 3. Deploy contracts

```bash
npm install
npm run compile
npm run test           # sanity — expect 82 passing
npm run deploy:mocks
npm run deploy:core
npm run deploy:executors
npm run mint:demo      # seeds 10k mUSD / 1k mTKA / 1k mTKB to deployer
```

Contract addresses land in `deployments/helaTestnet.json` and print to stdout.
Grab them for step 4.

## 4. Configure the frontend

```bash
cd frontend
cp .env.local.example .env.local
# paste the addresses from deployments/helaTestnet.json into .env.local
# NEXT_PUBLIC_MOCK_USD_ADDR=0x...
# NEXT_PUBLIC_VAULT_FACTORY_ADDR=0x...
# ... and so on for all NEXT_PUBLIC_* vars
npm install
npm run build
```

For the live demo URL, deploy to Vercel: `vercel --prod` (or push to the
Vercel-connected branch). Set the same env vars in Vercel's project settings.

## 5. Start the agent runtime (on a team laptop)

The runtime must run on a laptop where `claude` CLI is authenticated.

```bash
cd agent-runtime
cp .env.example .env
# fill in RPC_URL, PRIVATE_KEY (testnet dev key, same as deployer is fine),
# INTENT_REGISTRY_ADDR, DCA_EXECUTOR_ADDR, CONDITIONAL_TRANSFER_EXECUTOR_ADDR,
# RECURRING_TRANSFER_EXECUTOR_ADDR, and the MOCK_*_ADDR trio for parse-intent
npm install
node index.js
```

You should see `runtime-start` logged immediately and cycle logs every 15s.

For judges to reach the runtime from the Vercel frontend, expose it via
cloudflared:

```bash
# in another terminal, with cloudflared installed
cloudflared tunnel --url http://localhost:7777
# note the public *.trycloudflare.com URL printed
```

Set that URL as `NEXT_PUBLIC_RUNTIME_URL` in Vercel and redeploy (or use local
`npm run dev` for judges in person).

## 6. Acceptance walkthrough (run before every judge round)

1. Open a fresh MetaMask account, switch to HeLa testnet.
2. Visit the demo URL. Confirm prototype banner visible.
3. Switch to mainnet — confirm chain guard blocks access with clear error.
4. Back to HeLa testnet. Open `/faucet`.
5. Mint 1000 mUSD and 100 mTKA to the new account.
6. Home page → "Deploy my agent vault" → wait for confirmation.
7. "Fund it" card → approve 500 mUSD → deposit 500 mUSD.
8. `/new` → pick a DCA preset → "Parse with Claude" → preview → "Register"
   → "Approve cap" → go to dashboard.
9. Wait 15s. Dashboard shows nonce bumping. Click "Explain →" on the intent.
10. Explain tab shows execution cycles, Claude's reasoning, tx hash.
11. `/faucet` → drop mTKA price from $10 to $7 (25% drop). Within 15s, stop-loss
    fires. Explain tab logs the stop-loss event.
12. Dashboard → "Emergency withdraw mUSD". Balance returns to wallet in one tx.
13. Register a conditional transfer and a recurring transfer. Trigger each.

If any step fails, debug — don't present until it works. If you can't fix in
time, fall back to the `safe-harbor-v1` branch which has DCA-only working.

## 7. Reset between demo runs

- New MetaMask account, or create a second vault (one per user).
- Re-mint tokens from faucet.
- Intents from previous runs are inert (deactivated or cap-exhausted) and
  visible in the dashboard as history — fine for the judge to see.

## 8. Example flows for the demo video narration

**Flow 1 — DCA with stop-loss (30s)**
> "I'm telling my agent to buy $10 of mTKA every 30 seconds, stop if it drops
> 20% from where we start. Watch the nonce bump as it executes. Now I'm
> dropping the oracle price 25% — the stop-loss fires automatically."

**Flow 2 — Conditional transfer (20s)**
> "Here's a conditional: if mTKB goes above $10, send 50 mUSD to my roommate.
> I'll set the price to $12 — the agent transfers immediately and marks
> itself done."

**Flow 3 — Pause / revoke / emergency (30s)**
> "Everything is non-custodial. I can pause an agent mid-flight. Revoke it —
> the executor can't pull funds. And the emergency withdraw button returns
> all my tokens in one transaction, regardless of active intents."

**Flow 4 — Explain tab (20s)**
> "Every decision is logged. Here's the exact prompt Claude saw, its response,
> and the resulting transaction hash. If Claude is unavailable, a deterministic
> fallback executes and the log marks it clearly."

Total: 1m 40s core narrative + 3m for setup/close = ~5 min.
