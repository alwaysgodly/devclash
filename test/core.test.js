const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseEther = (v) => ethers.utils.parseEther(v.toString());
const id = (s) => ethers.utils.id(s);

describe("Core", function () {
  let owner, alice, bob, executor, otherExecutor;
  let mUSD;
  let factory, registry;

  beforeEach(async function () {
    [owner, alice, bob, executor, otherExecutor] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mUSD = await MockERC20.deploy("Mock USD", "mUSD");
    await mUSD.deployed();

    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    factory = await VaultFactory.deploy();
    await factory.deployed();

    const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
    registry = await IntentRegistry.deploy();
    await registry.deployed();
  });

  async function createVaultFor(signer) {
    await factory.connect(signer).createVault();
    const addr = await factory.vaultOf(signer.address);
    return await ethers.getContractAt("AgentVault", addr);
  }

  describe("VaultFactory", function () {
    it("createVault deploys a vault owned by caller", async function () {
      await expect(factory.connect(alice).createVault())
        .to.emit(factory, "VaultCreated");
      const vaultAddr = await factory.vaultOf(alice.address);
      expect(vaultAddr).to.not.equal(ethers.constants.AddressZero);

      const vault = await ethers.getContractAt("AgentVault", vaultAddr);
      expect(await vault.owner()).to.equal(alice.address);
    });

    it("createVault twice for same caller reverts", async function () {
      await factory.connect(alice).createVault();
      await expect(factory.connect(alice).createVault()).to.be.revertedWith(
        "Factory: vault exists"
      );
    });

    it("different users get different vaults", async function () {
      await factory.connect(alice).createVault();
      await factory.connect(bob).createVault();
      expect(await factory.vaultOf(alice.address)).to.not.equal(
        await factory.vaultOf(bob.address)
      );
    });
  });

  describe("AgentVault", function () {
    let vault;
    const INTENT_A = id("dca-intent-1");

    beforeEach(async function () {
      vault = await createVaultFor(alice);
      await mUSD.mint(alice.address, parseEther(1000));
      await mUSD.connect(alice).approve(vault.address, ethers.constants.MaxUint256);
    });

    describe("deposit / withdraw", function () {
      it("only owner can deposit", async function () {
        await mUSD.mint(bob.address, parseEther(10));
        await mUSD.connect(bob).approve(vault.address, ethers.constants.MaxUint256);
        await expect(
          vault.connect(bob).deposit(mUSD.address, parseEther(10))
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("zero-amount deposit reverts", async function () {
        await expect(
          vault.connect(alice).deposit(mUSD.address, 0)
        ).to.be.revertedWith("Vault: zero amount");
      });

      it("happy deposit then withdraw", async function () {
        await vault.connect(alice).deposit(mUSD.address, parseEther(100));
        expect(await mUSD.balanceOf(vault.address)).to.equal(parseEther(100));

        await vault.connect(alice).withdraw(mUSD.address, parseEther(30));
        expect(await mUSD.balanceOf(vault.address)).to.equal(parseEther(70));
        expect(await mUSD.balanceOf(alice.address)).to.equal(parseEther(930));
      });

      it("only owner can withdraw", async function () {
        await vault.connect(alice).deposit(mUSD.address, parseEther(10));
        await expect(
          vault.connect(bob).withdraw(mUSD.address, parseEther(1))
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("approveIntent / setPaused / revokeIntent", function () {
      it("only owner can approve", async function () {
        await expect(
          vault
            .connect(bob)
            .approveIntent(INTENT_A, mUSD.address, parseEther(50), executor.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("zero addr reverts", async function () {
        await expect(
          vault
            .connect(alice)
            .approveIntent(INTENT_A, ethers.constants.AddressZero, parseEther(50), executor.address)
        ).to.be.revertedWith("Vault: zero addr");
        await expect(
          vault
            .connect(alice)
            .approveIntent(INTENT_A, mUSD.address, parseEther(50), ethers.constants.AddressZero)
        ).to.be.revertedWith("Vault: zero addr");
      });

      it("zero cap reverts", async function () {
        await expect(
          vault.connect(alice).approveIntent(INTENT_A, mUSD.address, 0, executor.address)
        ).to.be.revertedWith("Vault: zero cap");
      });

      it("duplicate intent id reverts", async function () {
        await vault
          .connect(alice)
          .approveIntent(INTENT_A, mUSD.address, parseEther(50), executor.address);
        await expect(
          vault
            .connect(alice)
            .approveIntent(INTENT_A, mUSD.address, parseEther(100), executor.address)
        ).to.be.revertedWith("Vault: duplicate");
      });

      it("happy approve emits event and stores state", async function () {
        await expect(
          vault
            .connect(alice)
            .approveIntent(INTENT_A, mUSD.address, parseEther(50), executor.address)
        )
          .to.emit(vault, "IntentApproved")
          .withArgs(INTENT_A, mUSD.address, parseEther(50), executor.address);

        const a = await vault.approvals(INTENT_A);
        expect(a.token).to.equal(mUSD.address);
        expect(a.cap).to.equal(parseEther(50));
        expect(a.executor).to.equal(executor.address);
        expect(a.active).to.equal(true);
        expect(a.paused).to.equal(false);
        expect(a.spent).to.equal(0);

        const ids = await vault.getIntentIds();
        expect(ids.length).to.equal(1);
        expect(ids[0]).to.equal(INTENT_A);
      });

      it("setPaused flips state, requires owner, requires known id", async function () {
        await vault
          .connect(alice)
          .approveIntent(INTENT_A, mUSD.address, parseEther(50), executor.address);

        await expect(vault.connect(bob).setPaused(INTENT_A, true)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
        await expect(
          vault.connect(alice).setPaused(id("unknown"), true)
        ).to.be.revertedWith("Vault: unknown");

        await vault.connect(alice).setPaused(INTENT_A, true);
        expect((await vault.approvals(INTENT_A)).paused).to.equal(true);
      });

      it("revokeIntent flips active, requires owner, requires known id", async function () {
        await vault
          .connect(alice)
          .approveIntent(INTENT_A, mUSD.address, parseEther(50), executor.address);

        await expect(vault.connect(bob).revokeIntent(INTENT_A)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
        await expect(
          vault.connect(alice).revokeIntent(id("unknown"))
        ).to.be.revertedWith("Vault: unknown");

        await vault.connect(alice).revokeIntent(INTENT_A);
        expect((await vault.approvals(INTENT_A)).active).to.equal(false);
      });
    });

    describe("pullForIntent (security-critical)", function () {
      beforeEach(async function () {
        await vault.connect(alice).deposit(mUSD.address, parseEther(500));
        await vault
          .connect(alice)
          .approveIntent(INTENT_A, mUSD.address, parseEther(200), executor.address);
      });

      it("reverts when caller != registered executor", async function () {
        await expect(
          vault.connect(otherExecutor).pullForIntent(INTENT_A, parseEther(1), bob.address)
        ).to.be.revertedWith("Vault: wrong executor");
      });

      it("reverts when intent inactive (revoked)", async function () {
        await vault.connect(alice).revokeIntent(INTENT_A);
        await expect(
          vault.connect(executor).pullForIntent(INTENT_A, parseEther(1), bob.address)
        ).to.be.revertedWith("Vault: inactive");
      });

      it("reverts when intent paused", async function () {
        await vault.connect(alice).setPaused(INTENT_A, true);
        await expect(
          vault.connect(executor).pullForIntent(INTENT_A, parseEther(1), bob.address)
        ).to.be.revertedWith("Vault: paused");
      });

      it("reverts when cap exceeded (total)", async function () {
        await expect(
          vault.connect(executor).pullForIntent(INTENT_A, parseEther(201), bob.address)
        ).to.be.revertedWith("Vault: cap exceeded");
      });

      it("reverts when cumulative spending would exceed cap", async function () {
        await vault.connect(executor).pullForIntent(INTENT_A, parseEther(150), bob.address);
        await expect(
          vault.connect(executor).pullForIntent(INTENT_A, parseEther(51), bob.address)
        ).to.be.revertedWith("Vault: cap exceeded");
      });

      it("reverts on zero amount / zero recipient / unknown id", async function () {
        await expect(
          vault.connect(executor).pullForIntent(INTENT_A, 0, bob.address)
        ).to.be.revertedWith("Vault: zero amount");
        await expect(
          vault
            .connect(executor)
            .pullForIntent(INTENT_A, parseEther(1), ethers.constants.AddressZero)
        ).to.be.revertedWith("Vault: zero recipient");
        await expect(
          vault
            .connect(executor)
            .pullForIntent(id("unknown"), parseEther(1), bob.address)
        ).to.be.revertedWith("Vault: inactive");
      });

      it("happy path: transfers tokens, emits Pulled, increments spent", async function () {
        await expect(
          vault.connect(executor).pullForIntent(INTENT_A, parseEther(50), bob.address)
        )
          .to.emit(vault, "Pulled")
          .withArgs(INTENT_A, mUSD.address, parseEther(50), bob.address);

        expect(await mUSD.balanceOf(bob.address)).to.equal(parseEther(50));
        expect(await mUSD.balanceOf(vault.address)).to.equal(parseEther(450));
        const a = await vault.approvals(INTENT_A);
        expect(a.spent).to.equal(parseEther(50));
      });
    });

    describe("emergencyWithdraw", function () {
      it("only owner can call", async function () {
        await expect(
          vault.connect(bob).emergencyWithdraw(mUSD.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("transfers full balance to owner even when active intent exists", async function () {
        await vault.connect(alice).deposit(mUSD.address, parseEther(200));
        await vault
          .connect(alice)
          .approveIntent(INTENT_A, mUSD.address, parseEther(100), executor.address);

        await expect(vault.connect(alice).emergencyWithdraw(mUSD.address))
          .to.emit(vault, "EmergencyWithdrawn")
          .withArgs(mUSD.address, parseEther(200));

        expect(await mUSD.balanceOf(vault.address)).to.equal(0);
        expect(await mUSD.balanceOf(alice.address)).to.equal(parseEther(1000));
      });

      it("zero balance no-ops", async function () {
        await expect(vault.connect(alice).emergencyWithdraw(mUSD.address))
          .to.emit(vault, "EmergencyWithdrawn")
          .withArgs(mUSD.address, 0);
      });
    });
  });

  describe("IntentRegistry", function () {
    const INTENT_A = id("dca-intent-A");
    const PARAMS = "0x1234abcd";

    it("registerIntent stores state and emits event", async function () {
      await expect(
        registry
          .connect(alice)
          .registerIntent(INTENT_A, bob.address, executor.address, PARAMS)
      )
        .to.emit(registry, "IntentRegistered")
        .withArgs(INTENT_A, alice.address, executor.address, bob.address, PARAMS);

      const intent = await registry.getIntent(INTENT_A);
      expect(intent.owner).to.equal(alice.address);
      expect(intent.vault).to.equal(bob.address);
      expect(intent.executor).to.equal(executor.address);
      expect(intent.params).to.equal(PARAMS);
      expect(intent.active).to.equal(true);
      expect(intent.nonce).to.equal(0);
    });

    it("duplicate id reverts", async function () {
      await registry
        .connect(alice)
        .registerIntent(INTENT_A, bob.address, executor.address, PARAMS);
      await expect(
        registry
          .connect(alice)
          .registerIntent(INTENT_A, bob.address, executor.address, PARAMS)
      ).to.be.revertedWith("Registry: exists");
    });

    it("zero addr / empty params reverts", async function () {
      await expect(
        registry
          .connect(alice)
          .registerIntent(INTENT_A, ethers.constants.AddressZero, executor.address, PARAMS)
      ).to.be.revertedWith("Registry: zero addr");
      await expect(
        registry
          .connect(alice)
          .registerIntent(INTENT_A, bob.address, ethers.constants.AddressZero, PARAMS)
      ).to.be.revertedWith("Registry: zero addr");
      await expect(
        registry.connect(alice).registerIntent(INTENT_A, bob.address, executor.address, "0x")
      ).to.be.revertedWith("Registry: empty params");
    });

    it("deactivate only by owner", async function () {
      await registry
        .connect(alice)
        .registerIntent(INTENT_A, bob.address, executor.address, PARAMS);

      await expect(registry.connect(bob).deactivate(INTENT_A)).to.be.revertedWith(
        "Registry: not owner"
      );
      await registry.connect(alice).deactivate(INTENT_A);
      expect((await registry.getIntent(INTENT_A)).active).to.equal(false);
      await expect(registry.connect(alice).deactivate(INTENT_A)).to.be.revertedWith(
        "Registry: already inactive"
      );
    });

    it("bumpNonce only by registered executor", async function () {
      await registry
        .connect(alice)
        .registerIntent(INTENT_A, bob.address, executor.address, PARAMS);

      await expect(registry.connect(otherExecutor).bumpNonce(INTENT_A)).to.be.revertedWith(
        "Registry: not executor"
      );
      await expect(registry.connect(executor).bumpNonce(id("unknown"))).to.be.revertedWith(
        "Registry: unknown"
      );

      await expect(registry.connect(executor).bumpNonce(INTENT_A))
        .to.emit(registry, "NonceBumped")
        .withArgs(INTENT_A, 1);
      expect((await registry.getIntent(INTENT_A)).nonce).to.equal(1);

      await registry.connect(executor).bumpNonce(INTENT_A);
      expect((await registry.getIntent(INTENT_A)).nonce).to.equal(2);
    });

    it("listByOwner returns ids in registration order", async function () {
      const INTENT_B = id("dca-intent-B");
      await registry
        .connect(alice)
        .registerIntent(INTENT_A, bob.address, executor.address, PARAMS);
      await registry
        .connect(alice)
        .registerIntent(INTENT_B, bob.address, executor.address, PARAMS);

      const ids = await registry.listByOwner(alice.address);
      expect(ids).to.deep.equal([INTENT_A, INTENT_B]);
    });
  });
});
