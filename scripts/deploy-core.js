// Deploys core infrastructure (VaultFactory + IntentRegistry) to the target
// network and merges addresses into deployments/<networkName>.json.
// Executor contracts are deployed in a separate step once they exist.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network: ${network.name} (chainId ${network.config.chainId})`);

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy();
  await factory.deployed();
  console.log(`VaultFactory:   ${factory.address}`);

  const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
  const registry = await IntentRegistry.deploy();
  await registry.deployed();
  console.log(`IntentRegistry: ${registry.address}`);

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${network.name}.json`);
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath)) : {};
  const merged = {
    ...existing,
    chainId: network.config.chainId,
    core: {
      vaultFactory: factory.address,
      intentRegistry: registry.address,
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
