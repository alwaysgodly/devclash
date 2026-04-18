const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseEther = (v) => ethers.utils.parseEther(v.toString());

describe("Mocks", function () {
  let owner, alice, bob;
  let mUSD, mTKA, mTKB;
  let oracle, dex;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mUSD = await MockERC20.deploy("Mock USD", "mUSD");
    mTKA = await MockERC20.deploy("Mock Token A", "mTKA");
    mTKB = await MockERC20.deploy("Mock Token B", "mTKB");
    await mUSD.deployed();
    await mTKA.deployed();
    await mTKB.deployed();

    const MockOracle = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracle.deploy();
    await oracle.deployed();

    const MockDEX = await ethers.getContractFactory("MockDEX");
    dex = await MockDEX.deploy(oracle.address);
    await dex.deployed();
  });

  describe("MockERC20", function () {
    it("anyone can mint (public faucet for prototype)", async function () {
      await mUSD.connect(alice).mint(alice.address, parseEther(100));
      expect(await mUSD.balanceOf(alice.address)).to.equal(parseEther(100));
    });

    it("standard ERC20 transfer works", async function () {
      await mUSD.mint(alice.address, parseEther(10));
      await mUSD.connect(alice).transfer(bob.address, parseEther(3));
      expect(await mUSD.balanceOf(bob.address)).to.equal(parseEther(3));
      expect(await mUSD.balanceOf(alice.address)).to.equal(parseEther(7));
    });
  });

  describe("MockOracle", function () {
    it("only owner can set price", async function () {
      await expect(
        oracle.connect(alice).setPrice(mUSD.address, parseEther(1))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("setPrice then getPrice returns the value", async function () {
      await oracle.setPrice(mTKA.address, parseEther(10));
      expect(await oracle.getPrice(mTKA.address)).to.equal(parseEther(10));
    });

    it("getPrice reverts for unset token", async function () {
      await expect(oracle.getPrice(mTKB.address)).to.be.revertedWith(
        "MockOracle: price unset"
      );
    });

    it("setPrice emits PriceSet", async function () {
      await expect(oracle.setPrice(mUSD.address, parseEther(1)))
        .to.emit(oracle, "PriceSet")
        .withArgs(mUSD.address, parseEther(1));
    });
  });

  describe("MockDEX", function () {
    beforeEach(async function () {
      // mUSD = $1, mTKA = $10
      await oracle.setPrice(mUSD.address, parseEther(1));
      await oracle.setPrice(mTKA.address, parseEther(10));

      // alice gets 1000 mUSD
      await mUSD.mint(alice.address, parseEther(1000));
      await mUSD.connect(alice).approve(dex.address, ethers.constants.MaxUint256);
    });

    it("swap 100 mUSD -> 10 mTKA at configured prices", async function () {
      await dex.connect(alice).swap(
        mUSD.address,
        mTKA.address,
        parseEther(100),
        alice.address
      );
      expect(await mTKA.balanceOf(alice.address)).to.equal(parseEther(10));
      expect(await mUSD.balanceOf(alice.address)).to.equal(parseEther(900));
    });

    it("swap reverts if tokenIn == tokenOut", async function () {
      await expect(
        dex.connect(alice).swap(mUSD.address, mUSD.address, parseEther(1), alice.address)
      ).to.be.revertedWith("MockDEX: same token");
    });

    it("swap reverts if amountIn == 0", async function () {
      await expect(
        dex.connect(alice).swap(mUSD.address, mTKA.address, 0, alice.address)
      ).to.be.revertedWith("MockDEX: zero amount");
    });

    it("swap reverts if recipient is zero", async function () {
      await expect(
        dex.connect(alice).swap(
          mUSD.address,
          mTKA.address,
          parseEther(1),
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("MockDEX: zero recipient");
    });

    it("swap reverts if priceOut is unset", async function () {
      await expect(
        dex.connect(alice).swap(mUSD.address, mTKB.address, parseEther(1), alice.address)
      ).to.be.revertedWith("MockOracle: price unset");
    });

    it("swap emits Swapped with correct math", async function () {
      await expect(
        dex
          .connect(alice)
          .swap(mUSD.address, mTKA.address, parseEther(50), bob.address)
      )
        .to.emit(dex, "Swapped")
        .withArgs(
          alice.address,
          mUSD.address,
          mTKA.address,
          parseEther(50),
          parseEther(5),
          bob.address
        );
      expect(await mTKA.balanceOf(bob.address)).to.equal(parseEther(5));
    });

    it("sub-unit output reverts (dust protection)", async function () {
      // priceIn=1e18, priceOut=1e36 → amountIn=1e17 * 1 / 1e18 = 0
      await oracle.setPrice(mTKB.address, parseEther("1000000000000000000")); // huge
      await mUSD.connect(alice).approve(dex.address, ethers.constants.MaxUint256);
      await expect(
        dex
          .connect(alice)
          .swap(mUSD.address, mTKB.address, 1, alice.address)
      ).to.be.revertedWith("MockDEX: zero output");
    });
  });
});
