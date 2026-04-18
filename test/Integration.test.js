const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseEther = (v) => ethers.utils.parseEther(v.toString());
const id = (s) => ethers.utils.id(s);

async function increaseTime(s) {
  await ethers.provider.send("evm_increaseTime", [s]);
  await ethers.provider.send("evm_mine", []);
}

describe("Integration — multi-intent on one vault", function () {
  let alice, bob, carol;
  let mUSD, mTKA, mTKB;
  let oracle, dex;
  let factory, registry, dca, cond, rec;
  let vault;

  function encodeDCA({ tokenIn, tokenOut, amountPerExec, intervalSec, stopLossBps }) {
    return ethers.utils.defaultAbiCoder.encode(
      ["tuple(address,address,uint256,uint256,uint256)"],
      [[tokenIn, tokenOut, amountPerExec, intervalSec, stopLossBps]]
    );
  }
  function encodeCond({ token, amount, recipient, priceToken, threshold, direction }) {
    return ethers.utils.defaultAbiCoder.encode(
      ["tuple(address,uint256,address,address,uint256,uint8)"],
      [[token, amount, recipient, priceToken, threshold, direction]]
    );
  }
  function encodeRec({ token, amount, recipient, intervalSec, maxExecutions }) {
    return ethers.utils.defaultAbiCoder.encode(
      ["tuple(address,uint256,address,uint256,uint256)"],
      [[token, amount, recipient, intervalSec, maxExecutions]]
    );
  }

  beforeEach(async function () {
    [, alice, bob, carol] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mUSD = await MockERC20.deploy("Mock USD", "mUSD");
    mTKA = await MockERC20.deploy("Mock Token A", "mTKA");
    mTKB = await MockERC20.deploy("Mock Token B", "mTKB");

    const MockOracle = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracle.deploy();

    const MockDEX = await ethers.getContractFactory("MockDEX");
    dex = await MockDEX.deploy(oracle.address);

    await oracle.setPrice(mUSD.address, parseEther(1));
    await oracle.setPrice(mTKA.address, parseEther(10));
    await oracle.setPrice(mTKB.address, parseEther(5));

    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    factory = await VaultFactory.deploy();

    const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
    registry = await IntentRegistry.deploy();

    const DCAExecutor = await ethers.getContractFactory("DCAExecutor");
    dca = await DCAExecutor.deploy(registry.address, oracle.address, dex.address);

    const Cond = await ethers.getContractFactory("ConditionalTransferExecutor");
    cond = await Cond.deploy(registry.address, oracle.address);

    const Rec = await ethers.getContractFactory("RecurringTransferExecutor");
    rec = await Rec.deploy(registry.address);

    await factory.connect(alice).createVault();
    vault = await ethers.getContractAt(
      "AgentVault",
      await factory.vaultOf(alice.address)
    );
    await mUSD.mint(alice.address, parseEther(10000));
    await mUSD.connect(alice).approve(vault.address, ethers.constants.MaxUint256);
    await vault.connect(alice).deposit(mUSD.address, parseEther(5000));
  });

  it("three intents on one vault execute independently and respect per-intent caps", async function () {
    const DCA = id("int-dca");
    const COND = id("int-cond");
    const REC = id("int-rec");

    // DCA: 10 mUSD -> mTKA every 60s, cap 50
    await registry.connect(alice).registerIntent(
      DCA,
      vault.address,
      dca.address,
      encodeDCA({
        tokenIn: mUSD.address,
        tokenOut: mTKA.address,
        amountPerExec: parseEther(10),
        intervalSec: 60,
        stopLossBps: 0,
      })
    );
    await vault
      .connect(alice)
      .approveIntent(DCA, mUSD.address, parseEther(50), dca.address);

    // Conditional: if mTKB >= $7, send 100 mUSD to bob
    await registry.connect(alice).registerIntent(
      COND,
      vault.address,
      cond.address,
      encodeCond({
        token: mUSD.address,
        amount: parseEther(100),
        recipient: bob.address,
        priceToken: mTKB.address,
        threshold: parseEther(7),
        direction: 0,
      })
    );
    await vault
      .connect(alice)
      .approveIntent(COND, mUSD.address, parseEther(100), cond.address);

    // Recurring: every 45s send 20 mUSD to carol, 3 times
    await registry.connect(alice).registerIntent(
      REC,
      vault.address,
      rec.address,
      encodeRec({
        token: mUSD.address,
        amount: parseEther(20),
        recipient: carol.address,
        intervalSec: 45,
        maxExecutions: 3,
      })
    );
    await vault
      .connect(alice)
      .approveIntent(REC, mUSD.address, parseEther(60), rec.address);

    // DCA runs 5 times (cap 50, amount 10)
    for (let i = 0; i < 5; i++) {
      await dca.execute(DCA, `dca ${i}`);
      await increaseTime(61);
    }
    expect(await mTKA.balanceOf(vault.address)).to.equal(parseEther(5));
    await expect(dca.execute(DCA, "cap")).to.be.revertedWith("Vault: cap exceeded");

    // Conditional fires when mTKB price rises
    await expect(cond.execute(COND, "not yet")).to.be.revertedWith(
      "Cond: below threshold"
    );
    await oracle.setPrice(mTKB.address, parseEther(7));
    await cond.execute(COND, "price hit");
    expect(await mUSD.balanceOf(bob.address)).to.equal(parseEther(100));

    // Recurring fires 3 times
    for (let i = 0; i < 3; i++) {
      await rec.execute(REC, `rec ${i}`);
      await increaseTime(46);
    }
    expect(await mUSD.balanceOf(carol.address)).to.equal(parseEther(60));
    await expect(rec.execute(REC, "over")).to.be.revertedWith("Rec: max reached");

    // emergencyWithdraw on mUSD while intents are still registered
    const beforeBal = await mUSD.balanceOf(alice.address);
    await vault.connect(alice).emergencyWithdraw(mUSD.address);
    const afterBal = await mUSD.balanceOf(alice.address);
    expect(afterBal.gt(beforeBal)).to.equal(true);
    // vault is drained of mUSD — further DCA would revert
  });

  it("executor reverts cleanly when vault has zero balance of tokenIn", async function () {
    const INTENT = id("empty-vault");
    // alice creates a new vault with NO deposit
    await factory.connect(bob).createVault();
    const bobVault = await ethers.getContractAt("AgentVault", await factory.vaultOf(bob.address));

    await registry.connect(bob).registerIntent(
      INTENT,
      bobVault.address,
      dca.address,
      encodeDCA({
        tokenIn: mUSD.address,
        tokenOut: mTKA.address,
        amountPerExec: parseEther(1),
        intervalSec: 10,
        stopLossBps: 0,
      })
    );
    await bobVault
      .connect(bob)
      .approveIntent(INTENT, mUSD.address, parseEther(10), dca.address);

    // No mUSD in vault → SafeERC20 transfer in pullForIntent reverts
    await expect(dca.execute(INTENT, "x")).to.be.reverted;
  });

  it("replay-resistance: offline re-send with same calldata is idempotent via nonce bump", async function () {
    const INTENT = id("replay-test");
    await registry.connect(alice).registerIntent(
      INTENT,
      vault.address,
      dca.address,
      encodeDCA({
        tokenIn: mUSD.address,
        tokenOut: mTKA.address,
        amountPerExec: parseEther(10),
        intervalSec: 60,
        stopLossBps: 0,
      })
    );
    await vault
      .connect(alice)
      .approveIntent(INTENT, mUSD.address, parseEther(100), dca.address);

    await dca.execute(INTENT, "first");
    expect((await registry.getIntent(INTENT)).nonce).to.equal(1);

    // Second attempt without advancing time — reverts, nonce unchanged
    await expect(dca.execute(INTENT, "replay")).to.be.revertedWith(
      "DCA: interval not elapsed"
    );
    expect((await registry.getIntent(INTENT)).nonce).to.equal(1);
  });
});
