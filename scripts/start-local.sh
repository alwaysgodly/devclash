#!/usr/bin/env bash
# One-command local demo bootstrap for Onchain Agents (DevClash 2026 PS 02).
#
#   npm run demo
#
# Brings up: hardhat node, all contract deploys, agent runtime, frontend.
# Logs go to logs/*.log. Ctrl-C cleans up all child processes.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
mkdir -p logs

banner() { printf "\n\033[1;35m[demo] %s\033[0m\n" "$*"; }
warn()   { printf "\033[1;33m[demo] %s\033[0m\n" "$*"; }
fail()   { printf "\033[1;31m[demo] %s\033[0m\n" "$*"; exit 1; }

# --- prereq checks ---------------------------------------------------------
command -v node     >/dev/null || fail "node not found — install Node 18+"
command -v npm      >/dev/null || fail "npm not found"
command -v npx      >/dev/null || fail "npx not found"
if ! command -v gemini >/dev/null 2>&1 && ! command -v claude >/dev/null 2>&1; then
  warn "Neither gemini nor claude CLI was found on PATH — the runtime's LLM narration will fail until one is installed and authenticated. See README.md."
fi

# --- port probe ------------------------------------------------------------
if lsof -iTCP:8545 -sTCP:LISTEN -Pn >/dev/null 2>&1; then
  fail "Port 8545 is already in use — a hardhat node is probably already running. Stop it first, or run the services manually (see README)."
fi
if lsof -iTCP:7777 -sTCP:LISTEN -Pn >/dev/null 2>&1; then
  fail "Port 7777 is already in use — an agent-runtime is probably already running."
fi
if lsof -iTCP:3000 -sTCP:LISTEN -Pn >/dev/null 2>&1; then
  warn "Port 3000 is in use — Next.js will pick the next free port. Watch its log."
fi

# --- install deps if missing ----------------------------------------------
[ -d node_modules ]                     || { banner "Installing root deps";      npm install; }
[ -d agent-runtime/node_modules ]       || { banner "Installing runtime deps";   ( cd agent-runtime && npm install ); }
[ -d frontend/node_modules ]            || { banner "Installing frontend deps";  ( cd frontend      && npm install ); }

# --- ensure env files exist ------------------------------------------------
if [ ! -f agent-runtime/.env ]; then
  banner "Seeding agent-runtime/.env for localhost"
  cat > agent-runtime/.env <<'EOF'
LLM_PROVIDER=gemini
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
# Hardhat account #0 — public testnet-only key. Never reuse on mainnet.
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CYCLE_MS=3000
HTTP_PORT=7777
INTENT_REGISTRY_ADDR=0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0
DCA_EXECUTOR_ADDR=0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82
CONDITIONAL_TRANSFER_EXECUTOR_ADDR=0x9A676e781A523b5d0C0e43731313A708CB607508
RECURRING_TRANSFER_EXECUTOR_ADDR=0x0B306BF915C4d645ff596e518fAf3F9669b97016
MOCK_USD_ADDR=0x5FbDB2315678afecb367f032d93F642f64180aa3
MOCK_TKA_ADDR=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
MOCK_TKB_ADDR=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
MOCK_ORACLE_ADDR=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
MOCK_DEX_ADDR=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
EOF
fi

if [ ! -f frontend/.env.local ]; then
  banner "Seeding frontend/.env.local for localhost"
  cat > frontend/.env.local <<'EOF'
NEXT_PUBLIC_RUNTIME_URL=http://localhost:7777
NEXT_PUBLIC_MOCK_USD_ADDR=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_MOCK_TKA_ADDR=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
NEXT_PUBLIC_MOCK_TKB_ADDR=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
NEXT_PUBLIC_MOCK_ORACLE_ADDR=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
NEXT_PUBLIC_MOCK_DEX_ADDR=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
NEXT_PUBLIC_VAULT_FACTORY_ADDR=0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
NEXT_PUBLIC_INTENT_REGISTRY_ADDR=0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0
NEXT_PUBLIC_DCA_EXECUTOR_ADDR=0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82
NEXT_PUBLIC_CONDITIONAL_TRANSFER_EXECUTOR_ADDR=0x9A676e781A523b5d0C0e43731313A708CB607508
NEXT_PUBLIC_RECURRING_TRANSFER_EXECUTOR_ADDR=0x0B306BF915C4d645ff596e518fAf3F9669b97016
EOF
fi

# --- start hardhat node ----------------------------------------------------
banner "Starting hardhat node on :8545  (logs/hardhat.log)"
npx hardhat node > logs/hardhat.log 2>&1 &
HARDHAT_PID=$!

cleanup() {
  echo ""
  banner "Shutting down (PIDs: $HARDHAT_PID ${RUNTIME_PID:-} ${FRONTEND_PID:-})"
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  [ -n "${RUNTIME_PID:-}"  ] && kill "$RUNTIME_PID"  2>/dev/null || true
  kill "$HARDHAT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Wait for RPC to be responsive
for _ in $(seq 1 40); do
  if curl -sf http://127.0.0.1:8545 -X POST -H "content-type: application/json" \
      --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# --- deploy contracts ------------------------------------------------------
banner "Deploying contracts to localhost (3 scripts)"
npx hardhat run scripts/deploy-mocks.js    --network localhost
npx hardhat run scripts/deploy-core.js     --network localhost
npx hardhat run scripts/deploy-executors.js --network localhost

# --- start agent runtime ---------------------------------------------------
banner "Starting agent runtime on :7777  (logs/runtime.log)"
( cd agent-runtime && node index.js > ../logs/runtime.log 2>&1 ) &
RUNTIME_PID=$!

# --- start frontend --------------------------------------------------------
banner "Starting frontend on :3000  (logs/frontend.log)"
( cd frontend && npm run dev > ../logs/frontend.log 2>&1 ) &
FRONTEND_PID=$!

cat <<EOF

============================================================
 Onchain Agents — all services up
============================================================
  Frontend :  http://localhost:3000
  Runtime  :  http://localhost:7777/health
  Chain    :  http://127.0.0.1:8545   (chainId 31337)

  Logs     :  tail -f logs/hardhat.log logs/runtime.log logs/frontend.log
  Stop all :  Ctrl-C (cleans up all 3 processes)

 MetaMask setup (once):
   1. Add network  Name: Hardhat Localhost
                   RPC:  http://127.0.0.1:8545
                   Chain id: 31337
   2. Import account using private key:
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
      (Hardhat default account #0 — testnet dummy key, safe to paste.)
============================================================

EOF

wait
