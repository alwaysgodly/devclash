# Onchain Agents — DevClash 2026 PS 02

> ⚠️ **PROTOTYPE — HeLa testnet only. No real funds. All tokens and oracles are mocks.**
> Do not connect a wallet holding real assets. The agent runtime uses a testnet-only
> dev key; production would use session keys, account abstraction, or threshold signing.

Infrastructure for deploying and managing autonomous onchain agents that execute
user-defined intents on the HeLa blockchain. The prototype ships three reference intent
types on top of a non-custodial per-user "guarded-box" vault: DCA with stop-loss,
conditional transfers, and recurring transfers.

## How it maps to PS 02's six requirements

1. **Deploy agents:** `VaultFactory.createVault()` + `IntentRegistry.registerIntent()`.
2. **User-defined intents:** natural-language input parsed by Claude into structured
   on-chain params.
3. **Autonomous execution:** off-chain Node.js runtime polls the registry, calls
   Claude for decide+explain, submits txs.
4. **Monitoring + control:** dashboard with pause/modify/revoke/emergency-withdraw.
5. **Secure execution:** non-custodial vault, per-intent token caps, executor-scoped
   pull, reentrancy guards, nonce replay protection.
6. **Logs + explainability:** every execution cycle persists
   `{prompt, llm_response, reason, tx_hash}` and surfaces it in the UI.

## Quick start

> Prerequisites: Node 18+, a fresh MetaMask (testnet only), `claude` CLI authenticated
> on the machine that runs the agent runtime.

```bash
# install deps
npm install

# compile + test contracts
npm run compile
npm run test

# deploy to HeLa testnet (needs DEPLOYER_PRIVATE_KEY in .env)
cp .env.example .env
# edit .env with your testnet key + run:
npm run deploy:mocks
npm run deploy:core
npm run mint:demo

# start the agent runtime (on the team laptop with `claude` authenticated)
cd agent-runtime && npm install && node index.js

# run the frontend locally
cd frontend && npm install && npm run dev
```

## Deployment addresses

_Populated after deploy scripts run — see `deployments/helaTestnet.json`._

## Example transactions

_Populated during the build — three example tx hashes demonstrating core flows._

## Repository layout

See `docs/` for the system diagram, security notes, and prototype disclaimers.
The hour-by-hour build plan lives in the project plan file.

## License

Prototype code for hackathon submission. Not audited, not for production.
