require("dotenv").config();

const REQUIRED = ["RPC_URL", "PRIVATE_KEY", "INTENT_REGISTRY_ADDR"];
for (const k of REQUIRED) {
  if (!process.env[k]) {
    throw new Error(`agent-runtime: missing env var ${k}`);
  }
}

module.exports = {
  rpcUrl: process.env.RPC_URL,
  chainId: Number(process.env.CHAIN_ID || 666888),
  privateKey: process.env.PRIVATE_KEY,
  registryAddr: process.env.INTENT_REGISTRY_ADDR,
  dcaExecutorAddr: process.env.DCA_EXECUTOR_ADDR || "",
  conditionalTransferExecutorAddr:
    process.env.CONDITIONAL_TRANSFER_EXECUTOR_ADDR || "",
  recurringTransferExecutorAddr:
    process.env.RECURRING_TRANSFER_EXECUTOR_ADDR || "",
  tokens: {
    mUSD: process.env.MOCK_USD_ADDR || "",
    mTKA: process.env.MOCK_TKA_ADDR || "",
    mTKB: process.env.MOCK_TKB_ADDR || "",
  },
  cycleMs: Number(process.env.CYCLE_MS || 15000),
  httpPort: Number(process.env.HTTP_PORT || 7777),
};
