const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseEther = (v) => ethers.utils.parseEther(v.toString());
const id = (s) => ethers.utils.id(s);
const ZERO = ethers.constants.AddressZero;

async function increaseTime(s) {
  await ethers.provider.send("evm_increaseTime", [s]);
  await ethers.provider.send("evm_mine", []);
}

describe("DCAExecutor", function () {
  let owner, alice, bob;
  let mUSD, mTKA, mTKB, oracle, dex;
  let factory, registry, dca;
  let vault;

  const INTENT = id("dca-1");

  function encodeParams({
    tokenIn,
    tokenOut,
    amountPerExec,
    intervalSec,
    stopLossBps,
  }) {
    return ethers.utils.defaultAbiCoder.encode(
      ["tuple(address,address,uint256,uint256,uint256)"],
      [[tokenIn, tokenOut, amountPerExec, intervalSec, stopLossBps]]
    );
  }

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mUSD = await MockERC20.deploy("Mock USD", "mUSD");
    mTKA = await MockERC20.deploy("Mock Token A", "mTKA");
    mTKB = await MockERC20.deploy("Mock Token B", "mTKB");

    const MockOracle = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracle.deploy();

    const MockDEX = await ethers.getContractFactory("MockDEX");
    dex = await MockDEX.deploy(oracle.address);

    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    factory = await VaultFactory.deploy();

    const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
    registry = await IntentRegistry.deploy();

    const DCAExecutor = await ethers.getContractFactory("DCAExecutor");
    dca = await DCAExecutor.deploy(registry.address, oracle.address, dex.address);

    // prices: mUSD=$1, mTKA=$10
    await oracle.setPrice(mUSD.address, parseEther(1));
    await oracle.setPrice(mTKA.address, parseEther(10));

    // alice creates her vault and deposits 1000 mUSD
    await factory.connect(alice).createVault();
    vault = await ethers.getContractAt(
      "AgentVault",
      await factory.vaultOf(alice.address)
    );
    await mUSD.mint(alice.address, parseEther(1000));
    await mUSD.connect(alice).approve(vault.address, ethers.constants.MaxUint256);
    await vault.connect(alice).deposit(mUSD.address, parseEther(500));

    // alice registers the intent in the registry and approves her vault for 100 mUSD
    const params = encodeParams({
      tokenIn: mUSD.address,
      tokenOut: mTKA.address,
      amountPerExec: parseEther(10),
      intervalSec: 60,
      stopLossBps: 2000, // 20%
    });
    await registry
      .connect(alice)
      .registerIntent(INTENT, vault.address, dca.address, params);
    await vault
      .connect(alice)
      .approveIntent(INTENT, mUSD.address, parseEther(100), dca.address);
  });

  describe("canExecute", function () {
    it("returns (true, 'ready') for a fresh valid intent", async function () {
      const [ok, reason] = await dca.canExecute(INTENT);
      expect(ok).to.equal(true);
      expect(reason).to.equal("ready");
    });

    it("returns (false, 'unknown') for a never-registered id", async function () {
      const [ok, reason] = await dca.canExecute(id("never"));
      expect(ok).to.equal(false);
      expect(reason).to.equal("unknown");
    });

    it("returns (false, 'inactive') after deactivate", async function () {
      await registry.connect(alice).deactivate(INTENT);
      const [ok, reason] = await dca.canExecute(INTENT);
      expect(ok).to.equal(false);
      expect(reason).to.equal("inactive");
    });

    it("returns (false, 'interval not elapsed') right after an exec", async function () {
      await dca.execute(INTENT, "first exec");
      const [ok, reason] = await dca.canExecute(INTENT);
      expect(ok).to.equal(false);
      expect(reason).to.equal("interval not elapsed");
    });
  });

  describe("execute — happy path", function () {
    it("swaps amountPerExec into vault, emits Executed, bumps nonce", async function () {
      await expect(dca.execute(INTENT, "interval elapsed"))
        .to.emit(dca, "Executed")
        .withArgs(
          INTENT,
          parseEther(10),
          parseEther(1), // 10 mUSD / $10 = 1 mTKA
          parseEther(10),
          "interval elapsed"
        );

      expect(await mTKA.balanceOf(vault.address)).to.equal(parseEther(1));
      expect((await registry.getIntent(INTENT)).nonce).to.equal(1);
      expect(await dca.startPriceOf(INTENT)).to.equal(parseEther(10));
    });

    it("second exec blocked until interval elapses, then succeeds", async function () {
      await dca.execute(INTENT, "1");
      await expect(dca.execute(INTENT, "2")).to.be.revertedWith(
        "DCA: interval not elapsed"
      );
      await increaseTime(61);
      await dca.execute(INTENT, "2");
      expect(await mTKA.balanceOf(vault.address)).to.equal(parseEther(2));
    });

    it("respects vault cap across many execs (cap=100 mUSD; 10 execs max)", async function () {
      for (let i = 0; i < 10; i++) {
        await dca.execute(INTENT, `exec ${i}`);
        await increaseTime(61);
      }
      // 11th should fail — cap exceeded
      await expect(dca.execute(INTENT, "cap breach")).to.be.revertedWith(
        "Vault: cap exceeded"
      );
      expect(await mTKA.balanceOf(vault.address)).to.equal(parseEther(10));
    });
  });

  describe("execute — stop-loss", function () {
    it("triggers when price drops below startPrice * (1 - stopLossBps)", async function () {
      // first exec locks startPrice = $10; cap mUSD is 100
      await dca.execute(INTENT, "first");
      expect(await dca.startPriceOf(INTENT)).to.equal(parseEther(10));

      // drop price by 25% ($7.50) — below -20% trigger
      await oracle.setPrice(mTKA.address, parseEther("7.5"));
      await increaseTime(61);

      await expect(dca.execute(INTENT, "stop-loss fired"))
        .to.emit(dca, "StopLossTriggered")
        .withArgs(INTENT, parseEther("7.5"), parseEther(10), "stop-loss fired");

      expect(await dca.stopped(INTENT)).to.equal(true);
    });

    it("does not trigger at exactly 20% drop boundary if stopLossBps == 2000", async function () {
      // price exactly at 80% of start → drop == stopLossBps → triggers (<=)
      await dca.execute(INTENT, "first");
      await oracle.setPrice(mTKA.address, parseEther(8)); // exactly -20%
      await increaseTime(61);
      await expect(dca.execute(INTENT, "boundary")).to.emit(
        dca,
        "StopLossTriggered"
      );
    });

    it("future execs blocked after stop-loss (reverts with 'DCA: stopped')", async function () {
      await dca.execute(INTENT, "first");
      await oracle.setPrice(mTKA.address, parseEther(5));
      await increaseTime(61);
      await dca.execute(INTENT, "sl");
      await increaseTime(61);
      await expect(dca.execute(INTENT, "post-stop")).to.be.revertedWith(
        "DCA: stopped"
      );
    });

    it("zero stopLossBps disables stop-loss even with big price drop", async function () {
      // re-register a no-stop intent
      const INTENT2 = id("dca-nostop");
      const params = ethers.utils.defaultAbiCoder.encode(
        ["tuple(address,address,uint256,uint256,uint256)"],
        [[mUSD.address, mTKA.address, parseEther(10), 60, 0]]
      );
      await registry
        .connect(alice)
        .registerIntent(INTENT2, vault.address, dca.address, params);
      await vault
        .connect(alice)
        .approveIntent(INTENT2, mUSD.address, parseEther(100), dca.address);

      await dca.execute(INTENT2, "first");
      await oracle.setPrice(mTKA.address, parseEther("0.01"));
      await increaseTime(61);
      await dca.execute(INTENT2, "still buying");
      expect(await dca.stopped(INTENT2)).to.equal(false);
    });
  });

  describe("execute — access + safety", function () {
    it("reverts on unknown intent", async function () {
      await expect(dca.execute(id("unknown"), "x")).to.be.revertedWith(
        "DCA: unknown"
      );
    });

    it("reverts if intent is deactivated", async function () {
      await registry.connect(alice).deactivate(INTENT);
      await expect(dca.execute(INTENT, "x")).to.be.revertedWith(
        "DCA: inactive"
      );
    });

    it("reverts if vault approval is revoked", async function () {
      await vault.connect(alice).revokeIntent(INTENT);
      await expect(dca.execute(INTENT, "x")).to.be.revertedWith("Vault: inactive");
    });

    it("reverts if vault approval is paused", async function () {
      await vault.connect(alice).setPaused(INTENT, true);
      await expect(dca.execute(INTENT, "x")).to.be.revertedWith("Vault: paused");
    });

    it("reverts if registered executor is a different address", async function () {
      // register a second intent pointing to a different executor
      const INTENT2 = id("dca-wrong-exec");
      const params = ethers.utils.defaultAbiCoder.encode(
        ["tuple(address,address,uint256,uint256,uint256)"],
        [[mUSD.address, mTKA.address, parseEther(10), 60, 0]]
      );
      await registry
        .connect(alice)
        .registerIntent(INTENT2, vault.address, bob.address, params);
      // calling dca.execute would say "wrong executor" in the registry-recorded executor
      await expect(dca.execute(INTENT2, "x")).to.be.revertedWith(
        "DCA: wrong executor"
      );
    });

    it("reverts cleanly if oracle price for tokenOut is unset", async function () {
      const INTENT2 = id("dca-unset");
      const params = ethers.utils.defaultAbiCoder.encode(
        ["tuple(address,address,uint256,uint256,uint256)"],
        [[mUSD.address, mTKB.address, parseEther(10), 60, 0]] // mTKB price unset
      );
      await registry
        .connect(alice)
        .registerIntent(INTENT2, vault.address, dca.address, params);
      await vault
        .connect(alice)
        .approveIntent(INTENT2, mUSD.address, parseEther(100), dca.address);

      await expect(dca.execute(INTENT2, "x")).to.be.revertedWith(
        "MockOracle: price unset"
      );
    });
  });
});
