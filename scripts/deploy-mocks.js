// Deploys mock contracts to whatever --network we're invoked with.
// Writes addresses into deployments/<networkName>.json (merge-safe).
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const parseEther = (v) => hre.ethers.utils.parseEther(v.toString());

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network: ${network.name} (chainId ${network.config.chainId})`);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mUSD = await MockERC20.deploy("Mock USD", "mUSD");
  await mUSD.deployed();
  console.log(`mUSD:   ${mUSD.address}`);

  const mTKA = await MockERC20.deploy("Mock Token A", "mTKA");
  await mTKA.deployed();
  console.log(`mTKA:   ${mTKA.address}`);

  const mTKB = await MockERC20.deploy("Mock Token B", "mTKB");
  await mTKB.deployed();
  console.log(`mTKB:   ${mTKB.address}`);

  const MockOracle = await ethers.getContractFactory("MockOracle");
  const oracle = await MockOracle.deploy();
  await oracle.deployed();
  console.log(`Oracle: ${oracle.address}`);

  const MockDEX = await ethers.getContractFactory("MockDEX");
  const dex = await MockDEX.deploy(oracle.address);
  await dex.deployed();
  console.log(`DEX:    ${dex.address}`);

  // Initial prices: mUSD=$1, mTKA=$10, mTKB=$5
  await (await oracle.setPrice(mUSD.address, parseEther(1))).wait();
  await (await oracle.setPrice(mTKA.address, parseEther(10))).wait();
  await (await oracle.setPrice(mTKB.address, parseEther(5))).wait();
  console.log("Initial prices set: mUSD=$1, mTKA=$10, mTKB=$5");

  // Seed deployer with some tokens for sanity
  await (await mUSD.mint(deployer.address, parseEther(10000))).wait();
  await (await mTKA.mint(deployer.address, parseEther(100))).wait();
  await (await mTKB.mint(deployer.address, parseEther(200))).wait();
  console.log("Deployer seeded: 10000 mUSD, 100 mTKA, 200 mTKB");

  // Persist addresses
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${network.name}.json`);
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath)) : {};
  const merged = {
    ...existing,
    chainId: network.config.chainId,
    mocks: {
      mUSD: mUSD.address,
      mTKA: mTKA.address,
      mTKB: mTKB.address,
      oracle: oracle.address,
      dex: dex.address,
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
