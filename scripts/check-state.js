const fs = require("fs");
const hre = require("hardhat");

async function main() {
  const d = JSON.parse(fs.readFileSync(`deployments/${hre.network.name}.json`));
  const [s] = await hre.ethers.getSigners();
  const factory = await hre.ethers.getContractAt("VaultFactory", d.core.vaultFactory);
  const registry = await hre.ethers.getContractAt("IntentRegistry", d.core.intentRegistry);
  const vaultAddr = await factory.vaultOf(s.address);
  const vault = await hre.ethers.getContractAt("AgentVault", vaultAddr);
  const mUSD = await hre.ethers.getContractAt("MockERC20", d.mocks.mUSD);
  const mTKA = await hre.ethers.getContractAt("MockERC20", d.mocks.mTKA);

  const fmt = (v) => hre.ethers.utils.formatEther(v);
  console.log(`Vault: ${vaultAddr}`);
  console.log(`  mUSD balance: ${fmt(await mUSD.balanceOf(vaultAddr))}`);
  console.log(`  mTKA balance: ${fmt(await mTKA.balanceOf(vaultAddr))}`);

  const ids = await vault.getIntentIds();
  console.log(`  Intents: ${ids.length}`);
  for (const id of ids) {
    const a = await vault.approvals(id);
    const r = await registry.getIntent(id);
    console.log(`    ${id}`);
    console.log(`      vault: cap=${fmt(a.cap)} spent=${fmt(a.spent)} active=${a.active} paused=${a.paused}`);
    console.log(`      registry: active=${r.active} nonce=${r.nonce.toString()}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
