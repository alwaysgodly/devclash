// Contract addresses on HeLa testnet. Populated via NEXT_PUBLIC_* env vars at
// build time so the team can edit a single .env.local after running the deploy
// scripts and redeploy the frontend without code changes.
export const addresses = {
  mUSD: (process.env.NEXT_PUBLIC_MOCK_USD_ADDR || "") as `0x${string}`,
  mTKA: (process.env.NEXT_PUBLIC_MOCK_TKA_ADDR || "") as `0x${string}`,
  mTKB: (process.env.NEXT_PUBLIC_MOCK_TKB_ADDR || "") as `0x${string}`,
  oracle: (process.env.NEXT_PUBLIC_MOCK_ORACLE_ADDR || "") as `0x${string}`,
  dex: (process.env.NEXT_PUBLIC_MOCK_DEX_ADDR || "") as `0x${string}`,
  vaultFactory: (process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDR || "") as `0x${string}`,
  intentRegistry: (process.env.NEXT_PUBLIC_INTENT_REGISTRY_ADDR || "") as `0x${string}`,
  dcaExecutor: (process.env.NEXT_PUBLIC_DCA_EXECUTOR_ADDR || "") as `0x${string}`,
  conditionalTransferExecutor: (process.env.NEXT_PUBLIC_CONDITIONAL_TRANSFER_EXECUTOR_ADDR || "") as `0x${string}`,
  recurringTransferExecutor: (process.env.NEXT_PUBLIC_RECURRING_TRANSFER_EXECUTOR_ADDR || "") as `0x${string}`,
};

export const isAddressSet = (a: string) =>
  typeof a === "string" && a.startsWith("0x") && a.length === 42;
