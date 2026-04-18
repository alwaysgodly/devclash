// Deploys executor contracts. Depends on mocks + core being deployed first
// (reads their addresses from deployments/<networkName>.json).
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network: ${network.name} (chainId ${network.config.chainId})`);

  const outDir = path.join(__dirname, "..", "deployments");
  const outPath = path.join(outDir, `${network.name}.json`);
  if (!fs.existsSync(outPath)) {
    throw new Error(
      `deployments/${network.name}.json not found — run deploy-mocks + deploy-core first`
    );
  }
  const existing = JSON.parse(fs.readFileSync(outPath));
  const registryAddr = existing.core && existing.core.intentRegistry;
  const oracleAddr = existing.mocks && existing.mocks.oracle;
  const dexAddr = existing.mocks && existing.mocks.dex;
  if (!registryAddr || !oracleAddr || !dexAddr) {
    throw new Error("missing core.intentRegistry / mocks.oracle / mocks.dex in deployments json");
  }

  const DCAExecutor = await ethers.getContractFactory("DCAExecutor");
  const dca = await DCAExecutor.deploy(registryAddr, oracleAddr, dexAddr);
  await dca.deployed();
  console.log(`DCAExecutor:                   ${dca.address}`);

  const Cond = await ethers.getContractFactory("ConditionalTransferExecutor");
  const cond = await Cond.deploy(registryAddr, oracleAddr);
  await cond.deployed();
  console.log(`ConditionalTransferExecutor:   ${cond.address}`);

  const Rec = await ethers.getContractFactory("RecurringTransferExecutor");
  const rec = await Rec.deploy(registryAddr);
  await rec.deployed();
  console.log(`RecurringTransferExecutor:     ${rec.address}`);

  const merged = {
    ...existing,
    executors: {
      ...(existing.executors || {}),
      dca: dca.address,
      conditionalTransfer: cond.address,
      recurringTransfer: rec.address,
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
