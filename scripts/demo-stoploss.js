// Demonstrates the stop-loss path end-to-end by dropping the oracle price and
// invoking DCAExecutor.execute — stop-loss branch runs before the vault cap
// check, so the event fires even though cap is already exhausted.
const fs = require("fs");
const hre = require("hardhat");

async function main() {
  const d = JSON.parse(fs.readFileSync(`deployments/${hre.network.name}.json`));
  const [s] = await hre.ethers.getSigners();
  const pe = (v) => hre.ethers.utils.parseEther(String(v));
  const fmt = (v) => hre.ethers.utils.formatEther(v);

  const oracle = await hre.ethers.getContractAt("MockOracle", d.mocks.oracle);
  const dca = await hre.ethers.getContractAt("DCAExecutor", d.executors.dca);
  const registry = await hre.ethers.getContractAt("IntentRegistry", d.core.intentRegistry);
  const factory = await hre.ethers.getContractAt("VaultFactory", d.core.vaultFactory);
  const vaultAddr = await factory.vaultOf(s.address);
  const vault = await hre.ethers.getContractAt("AgentVault", vaultAddr);

  const ids = await vault.getIntentIds();
  const intentId = ids[0];

  console.log(`Intent: ${intentId}`);
  console.log(`Current price mTKA: $${fmt(await oracle.getPrice(d.mocks.mTKA))}`);
  console.log(`startPrice locked:  $${fmt(await dca.startPriceOf(intentId))}`);
  console.log(`stopped?            ${await dca.stopped(intentId)}`);

  console.log(`\n>>> Dropping oracle price of mTKA to $6 (40% drop from $10 start)`);
  await (await oracle.setPrice(d.mocks.mTKA, pe(6))).wait();

  // Wait until interval elapsed (5s from last exec)
  await new Promise((r) => setTimeout(r, 6000));
  await hre.ethers.provider.send("evm_mine", []);

  console.log(`>>> Calling DCAExecutor.execute(intent, "stop-loss demo")`);
  const tx = await dca.execute(intentId, "Stop-loss: mTKA dropped 40% from start price");
  const rc = await tx.wait();
  const event = rc.events?.find((e) => e.event === "StopLossTriggered");
  console.log(`>>> Tx: ${rc.transactionHash} @ block ${rc.blockNumber}`);
  if (event) {
    console.log(`>>> StopLossTriggered:`);
    console.log(`      priceAtExec: $${fmt(event.args.priceAtExec)}`);
    console.log(`      startPrice:  $${fmt(event.args.startPrice)}`);
    console.log(`      explanation: "${event.args.explanation}"`);
  }

  console.log(`\n>>> Post-state:`);
  console.log(`    stopped?         ${await dca.stopped(intentId)}`);
  console.log(`    registry active? ${(await registry.getIntent(intentId)).active}`);
  console.log(`    nonce:           ${(await registry.getIntent(intentId)).nonce.toString()}`);
  console.log(`\n>>> Trying to execute again (should revert "DCA: stopped"):`);
  try {
    await dca.callStatic.execute(intentId, "should fail");
    console.log("    !! did NOT revert");
  } catch (e) {
    const msg = e.error?.message || e.message;
    console.log(`    ✓ reverted: ${msg.split(":")[msg.split(":").length - 1].trim()}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
