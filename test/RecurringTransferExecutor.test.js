const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseEther = (v) => ethers.utils.parseEther(v.toString());
const id = (s) => ethers.utils.id(s);

async function increaseTime(s) {
  await ethers.provider.send("evm_increaseTime", [s]);
  await ethers.provider.send("evm_mine", []);
}

describe("RecurringTransferExecutor", function () {
  let alice, bob;
  let mUSD;
  let factory, registry, rec;
  let vault;

  const INTENT = id("rec-1");

  function encode({ token, amount, recipient, intervalSec, maxExecutions }) {
    return ethers.utils.defaultAbiCoder.encode(
      ["tuple(address,uint256,address,uint256,uint256)"],
      [[token, amount, recipient, intervalSec, maxExecutions]]
    );
  }

  beforeEach(async function () {
    [, alice, bob] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mUSD = await MockERC20.deploy("Mock USD", "mUSD");

    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    factory = await VaultFactory.deploy();

    const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
    registry = await IntentRegistry.deploy();

    const Rec = await ethers.getContractFactory("RecurringTransferExecutor");
    rec = await Rec.deploy(registry.address);

    await factory.connect(alice).createVault();
    vault = await ethers.getContractAt(
      "AgentVault",
      await factory.vaultOf(alice.address)
    );
    await mUSD.mint(alice.address, parseEther(1000));
    await mUSD.connect(alice).approve(vault.address, ethers.constants.MaxUint256);
    await vault.connect(alice).deposit(mUSD.address, parseEther(500));

    // "every 60s transfer 10 mUSD to bob, max 4 times"
    const params = encode({
      token: mUSD.address,
      amount: parseEther(10),
      recipient: bob.address,
      intervalSec: 60,
      maxExecutions: 4,
    });
    await registry
      .connect(alice)
      .registerIntent(INTENT, vault.address, rec.address, params);
    await vault
      .connect(alice)
      .approveIntent(INTENT, mUSD.address, parseEther(100), rec.address);
  });

  it("first exec transfers, nonce + count bump", async function () {
    await expect(rec.execute(INTENT, "first"))
      .to.emit(rec, "Transferred")
      .withArgs(INTENT, parseEther(10), bob.address, 1, "first");
    expect(await mUSD.balanceOf(bob.address)).to.equal(parseEther(10));
    expect(await rec.execCount(INTENT)).to.equal(1);
    expect((await registry.getIntent(INTENT)).nonce).to.equal(1);
  });

  it("second exec reverts until interval elapses", async function () {
    await rec.execute(INTENT, "1");
    await expect(rec.execute(INTENT, "2")).to.be.revertedWith(
      "Rec: interval not elapsed"
    );
    await increaseTime(61);
    await rec.execute(INTENT, "2");
    expect(await rec.execCount(INTENT)).to.equal(2);
  });

  it("stops after maxExecutions hit", async function () {
    for (let i = 0; i < 4; i++) {
      await rec.execute(INTENT, `exec ${i}`);
      await increaseTime(61);
    }
    expect(await rec.execCount(INTENT)).to.equal(4);
    const [ok, reason] = await rec.canExecute(INTENT);
    expect(ok).to.equal(false);
    expect(reason).to.equal("max executions reached");
    await expect(rec.execute(INTENT, "over")).to.be.revertedWith("Rec: max reached");
  });

  it("maxExecutions=0 means unlimited (still bounded by vault cap)", async function () {
    const INTENT2 = id("rec-unlimited");
    const params = encode({
      token: mUSD.address,
      amount: parseEther(10),
      recipient: bob.address,
      intervalSec: 60,
      maxExecutions: 0,
    });
    await registry
      .connect(alice)
      .registerIntent(INTENT2, vault.address, rec.address, params);
    await vault
      .connect(alice)
      .approveIntent(INTENT2, mUSD.address, parseEther(30), rec.address);

    for (let i = 0; i < 3; i++) {
      await rec.execute(INTENT2, `${i}`);
      await increaseTime(61);
    }
    await expect(rec.execute(INTENT2, "cap")).to.be.revertedWith(
      "Vault: cap exceeded"
    );
  });

  it("reverts on pause / revoke / deactivate", async function () {
    await vault.connect(alice).setPaused(INTENT, true);
    await expect(rec.execute(INTENT, "x")).to.be.revertedWith("Vault: paused");
    await vault.connect(alice).setPaused(INTENT, false);
    await vault.connect(alice).revokeIntent(INTENT);
    await expect(rec.execute(INTENT, "x")).to.be.revertedWith("Vault: inactive");
  });

  it("reverts on unknown / bad params", async function () {
    await expect(rec.execute(id("never"), "x")).to.be.revertedWith("Rec: unknown");
    const bad = id("rec-bad");
    const badParams = encode({
      token: mUSD.address,
      amount: 0,
      recipient: bob.address,
      intervalSec: 60,
      maxExecutions: 1,
    });
    await registry
      .connect(alice)
      .registerIntent(bad, vault.address, rec.address, badParams);
    await vault
      .connect(alice)
      .approveIntent(bad, mUSD.address, parseEther(1), rec.address);
    await expect(rec.execute(bad, "x")).to.be.revertedWith("Rec: zero amount");
  });
});
