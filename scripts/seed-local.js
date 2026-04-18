// Local-demo seeder: uses the first hardhat account, creates a vault, funds
// it with 500 mUSD, registers a DCA intent that fires every 5s, and approves
// it on the vault. Prints the intent id so the runtime can be checked against it.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  const outPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const d = JSON.parse(fs.readFileSync(outPath));

  const mUSD = await ethers.getContractAt("MockERC20", d.mocks.mUSD);
  const factory = await ethers.getContractAt("VaultFactory", d.core.vaultFactory);
  const registry = await ethers.getContractAt("IntentRegistry", d.core.intentRegistry);

  // Create vault (if not already)
  let vaultAddr = await factory.vaultOf(deployer.address);
  if (vaultAddr === ethers.constants.AddressZero) {
    const tx = await factory.createVault();
    await tx.wait();
    vaultAddr = await factory.vaultOf(deployer.address);
  }
  const vault = await ethers.getContractAt("AgentVault", vaultAddr);
  console.log(`Vault: ${vaultAddr}`);

  // Fund vault with 500 mUSD
  await (await mUSD.approve(vault.address, ethers.constants.MaxUint256)).wait();
  await (await vault.deposit(mUSD.address, ethers.utils.parseEther("500"))).wait();
  const vaultBal = await mUSD.balanceOf(vault.address);
  console.log(`Vault mUSD balance: ${ethers.utils.formatEther(vaultBal)}`);

  // Register DCA intent: 10 mUSD -> mTKA every 5s, stop at -20%
  const intentId = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(`dca-local-demo-${Date.now()}`)
  );
  const params = ethers.utils.defaultAbiCoder.encode(
    ["tuple(address,address,uint256,uint256,uint256)"],
    [[
      d.mocks.mUSD,
      d.mocks.mTKA,
      ethers.utils.parseEther("10"),
      5, // 5 seconds
      2000, // 20%
    ]]
  );

  await (await registry.registerIntent(intentId, vault.address, d.executors.dca, params)).wait();
  console.log(`Intent registered: ${intentId}`);

  await (await vault.approveIntent(
    intentId,
    d.mocks.mUSD,
    ethers.utils.parseEther("100"),
    d.executors.dca
  )).wait();
  console.log(`Intent approved on vault (cap 100 mUSD)`);

  console.log("\nSeed complete. Start agent-runtime to watch it execute.");
  console.log(`Intent id: ${intentId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
