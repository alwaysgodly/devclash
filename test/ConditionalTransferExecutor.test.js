const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseEther = (v) => ethers.utils.parseEther(v.toString());
const id = (s) => ethers.utils.id(s);

describe("ConditionalTransferExecutor", function () {
  let alice, bob, carol;
  let mUSD, mTKA;
  let oracle;
  let factory, registry, xfer;
  let vault;

  const INTENT_GE = id("cond-ge");

  function encode({ token, amount, recipient, priceToken, threshold, direction }) {
    return ethers.utils.defaultAbiCoder.encode(
      ["tuple(address,uint256,address,address,uint256,uint8)"],
      [[token, amount, recipient, priceToken, threshold, direction]]
    );
  }

  beforeEach(async function () {
    [, alice, bob, carol] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mUSD = await MockERC20.deploy("Mock USD", "mUSD");
    mTKA = await MockERC20.deploy("Mock Token A", "mTKA");

    const MockOracle = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracle.deploy();

    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    factory = await VaultFactory.deploy();

    const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
    registry = await IntentRegistry.deploy();

    const Cond = await ethers.getContractFactory("ConditionalTransferExecutor");
    xfer = await Cond.deploy(registry.address, oracle.address);

    // Prices: mTKA = $10
    await oracle.setPrice(mTKA.address, parseEther(10));

    // alice funds her vault with 500 mUSD
    await factory.connect(alice).createVault();
    vault = await ethers.getContractAt(
      "AgentVault",
      await factory.vaultOf(alice.address)
    );
    await mUSD.mint(alice.address, parseEther(1000));
    await mUSD.connect(alice).approve(vault.address, ethers.constants.MaxUint256);
    await vault.connect(alice).deposit(mUSD.address, parseEther(500));

    // Intent: "when mTKA >= $12, send 100 mUSD to bob"
    const params = encode({
      token: mUSD.address,
      amount: parseEther(100),
      recipient: bob.address,
      priceToken: mTKA.address,
      threshold: parseEther(12),
      direction: 0, // >=
    });
    await registry
      .connect(alice)
      .registerIntent(INTENT_GE, vault.address, xfer.address, params);
    await vault
      .connect(alice)
      .approveIntent(INTENT_GE, mUSD.address, parseEther(100), xfer.address);
  });

  describe("canExecute", function () {
    it("returns false 'price below threshold' when price < threshold (direction=0)", async function () {
      const [ok, reason] = await xfer.canExecute(INTENT_GE);
      expect(ok).to.equal(false);
      expect(reason).to.equal("price below threshold");
    });

    it("returns true 'condition met' after price rises to threshold", async function () {
      await oracle.setPrice(mTKA.address, parseEther(12));
      const [ok, reason] = await xfer.canExecute(INTENT_GE);
      expect(ok).to.equal(true);
      expect(reason).to.equal("condition met");
    });

    it("returns false 'already executed' after execute", async function () {
      await oracle.setPrice(mTKA.address, parseEther(15));
      await xfer.execute(INTENT_GE, "triggered");
      const [ok, reason] = await xfer.canExecute(INTENT_GE);
      expect(ok).to.equal(false);
      expect(reason).to.equal("already executed");
    });

    it("returns false 'inactive' after deactivation", async function () {
      await registry.connect(alice).deactivate(INTENT_GE);
      const [ok, reason] = await xfer.canExecute(INTENT_GE);
      expect(ok).to.equal(false);
      expect(reason).to.equal("inactive");
    });
  });

  describe("execute (>= direction)", function () {
    it("reverts below threshold", async function () {
      await expect(xfer.execute(INTENT_GE, "x")).to.be.revertedWith(
        "Cond: below threshold"
      );
    });

    it("transfers to recipient when price hits threshold exactly", async function () {
      await oracle.setPrice(mTKA.address, parseEther(12));
      await expect(xfer.execute(INTENT_GE, "at the threshold"))
        .to.emit(xfer, "Triggered")
        .withArgs(INTENT_GE, parseEther(12), parseEther(100), bob.address, "at the threshold");

      expect(await mUSD.balanceOf(bob.address)).to.equal(parseEther(100));
      expect(await xfer.executedOf(INTENT_GE)).to.equal(true);
      expect((await registry.getIntent(INTENT_GE)).nonce).to.equal(1);
    });

    it("cannot double-execute", async function () {
      await oracle.setPrice(mTKA.address, parseEther(15));
      await xfer.execute(INTENT_GE, "first");
      await expect(xfer.execute(INTENT_GE, "second")).to.be.revertedWith(
        "Cond: already executed"
      );
    });
  });

  describe("execute (<= direction)", function () {
    it("transfers when price drops to threshold", async function () {
      const INTENT_LE = id("cond-le");
      const params = encode({
        token: mUSD.address,
        amount: parseEther(50),
        recipient: carol.address,
        priceToken: mTKA.address,
        threshold: parseEther(5),
        direction: 1, // <=
      });
      await registry
        .connect(alice)
        .registerIntent(INTENT_LE, vault.address, xfer.address, params);
      await vault
        .connect(alice)
        .approveIntent(INTENT_LE, mUSD.address, parseEther(50), xfer.address);

      // Currently $10 — condition not met
      await expect(xfer.execute(INTENT_LE, "x")).to.be.revertedWith(
        "Cond: above threshold"
      );

      // Drop price
      await oracle.setPrice(mTKA.address, parseEther(4));
      await xfer.execute(INTENT_LE, "price dropped");
      expect(await mUSD.balanceOf(carol.address)).to.equal(parseEther(50));
    });
  });

  describe("execute — access + safety", function () {
    it("reverts on unknown intent", async function () {
      await expect(xfer.execute(id("never"), "x")).to.be.revertedWith("Cond: unknown");
    });

    it("reverts on vault-revoked intent", async function () {
      await oracle.setPrice(mTKA.address, parseEther(15));
      await vault.connect(alice).revokeIntent(INTENT_GE);
      await expect(xfer.execute(INTENT_GE, "x")).to.be.revertedWith("Vault: inactive");
    });

    it("reverts if approval paused", async function () {
      await oracle.setPrice(mTKA.address, parseEther(15));
      await vault.connect(alice).setPaused(INTENT_GE, true);
      await expect(xfer.execute(INTENT_GE, "x")).to.be.revertedWith("Vault: paused");
    });

    it("reverts if oracle price unset", async function () {
      const INTENT_U = id("cond-unset");
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const mTKC = await MockERC20.deploy("Mock Token C", "mTKC");
      const params = encode({
        token: mUSD.address,
        amount: parseEther(10),
        recipient: bob.address,
        priceToken: mTKC.address, // price never set
        threshold: parseEther(1),
        direction: 0,
      });
      await registry
        .connect(alice)
        .registerIntent(INTENT_U, vault.address, xfer.address, params);
      await vault
        .connect(alice)
        .approveIntent(INTENT_U, mUSD.address, parseEther(10), xfer.address);
      await expect(xfer.execute(INTENT_U, "x")).to.be.revertedWith("MockOracle: price unset");
    });

    it("reverts on bad params (zero amount/recipient/threshold or bad direction)", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      await oracle.setPrice(mTKA.address, parseEther(15));

      // zero amount
      const idZeroAmt = id("cond-zeroamt");
      await registry
        .connect(alice)
        .registerIntent(
          idZeroAmt,
          vault.address,
          xfer.address,
          encode({
            token: mUSD.address,
            amount: 0,
            recipient: bob.address,
            priceToken: mTKA.address,
            threshold: parseEther(10),
            direction: 0,
          })
        );
      await vault
        .connect(alice)
        .approveIntent(idZeroAmt, mUSD.address, parseEther(1), xfer.address);
      await expect(xfer.execute(idZeroAmt, "x")).to.be.revertedWith("Cond: zero amount");
    });
  });
});
