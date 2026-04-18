// Mints a demo stash (10,000 mUSD / 1,000 mTKA / 1,000 mTKB) to a target
// address and seeds oracle prices. Useful for setting up a demo account fast.
// Target defaults to the deployer; override with DEMO_RECIPIENT env var.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const recipient = process.env.DEMO_RECIPIENT || deployer.address;

  const outPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(outPath)) {
    throw new Error(`run deploy-mocks first (missing ${outPath})`);
  }
  const d = JSON.parse(fs.readFileSync(outPath));
  const mocks = d.mocks || {};
  if (!mocks.mUSD || !mocks.mTKA || !mocks.mTKB || !mocks.oracle) {
    throw new Error("mocks missing in deployments json");
  }

  const erc = (addr) => new ethers.Contract(
    addr,
    ["function mint(address,uint256) external"],
    deployer
  );
  const oracle = new ethers.Contract(
    mocks.oracle,
    ["function setPrice(address,uint256) external"],
    deployer
  );

  const pe = (v) => ethers.utils.parseEther(String(v));

  console.log(`Seeding demo to ${recipient} on ${network.name}`);
  await (await erc(mocks.mUSD).mint(recipient, pe(10_000))).wait();
  console.log("  + 10,000 mUSD");
  await (await erc(mocks.mTKA).mint(recipient, pe(1_000))).wait();
  console.log("  +  1,000 mTKA");
  await (await erc(mocks.mTKB).mint(recipient, pe(1_000))).wait();
  console.log("  +  1,000 mTKB");

  await (await oracle.setPrice(mocks.mUSD, pe(1))).wait();
  await (await oracle.setPrice(mocks.mTKA, pe(10))).wait();
  await (await oracle.setPrice(mocks.mTKB, pe(5))).wait();
  console.log("Oracle seeded: mUSD=$1, mTKA=$10, mTKB=$5");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
