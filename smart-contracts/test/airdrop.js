const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { time } = require("../utilities");

describe("Airdrop contract", function () {
  let Token;
  let rvltToken;
  let swapContract;
  let swap;
  let treasuryContract;
  let airdropContract;
  let airdrop;
  let treasury;
  let usdc;
  let usdcToken;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    Token = await ethers.getContractFactory("RVLT");
    swapContract = await ethers.getContractFactory("UniswapV2RouterMock");
    treasuryContract = await ethers.getContractFactory("Treasury");
    usdc = await ethers.getContractFactory("MockToken");
    airdropContract = await ethers.getContractFactory("Airdrop");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    swap = await swapContract.deploy();
    usdcToken = await usdc.deploy("USDC", "USDC");

    rvltToken = await upgrades.deployProxy(Token, [
      owner.address,
      "100000000000000000000000",
    ]);
    await rvltToken.deployed();

    airdrop = await airdropContract.deploy(rvltToken.address);

    treasury = await upgrades.deployProxy(treasuryContract, [
      rvltToken.address,
      swap.address,
      usdcToken.address,
    ]);
    await treasury.deployed();
    await rvltToken.setTreasuryAddress(treasury.address);
    await rvltToken.setWhitelistAddress(airdrop.address, true);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await airdrop.owner()).to.equal(owner.address);
    });
    it("Should set the right token contract address", async function () {
      expect(await airdrop.tokenAddr()).to.equal(rvltToken.address);
    });
  });

  describe("Update Token Address", function () {
    it("Owner call this methofd to update token address", async function () {
      await airdrop.updateTokenAddress(addr1.address);
      expect(await airdrop.tokenAddr()).to.equal(addr1.address);
    });

    it("Only owners can call this method", async function () {
      await expect(
        airdrop.connect(addr1).updateTokenAddress(addr1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
 
  describe("Withdraw Tokens", function () {
    it("Insufficeint fund on smart contract", async function () {
      await expect(
        airdrop.withdrawTokens(addr1.address, 100)
      ).to.be.revertedWith("Insufficient fund");
    });

    it("Owner call this method", async function () {
      await rvltToken.transfer(airdrop.address, 100);
      await airdrop.withdrawTokens(addr1.address, 100);
      let bal = await rvltToken.balanceOf(addr1.address);
      expect(bal).to.equal(100);
    });

    it("Only owners can call this method", async function () {
      await expect(
        airdrop.connect(addr1).withdrawTokens(addr1.address, 100)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Drop Tokens", function () {
    it("Invalid data", async function () {
      await expect(
        airdrop.dropTokens([addr1.address], [100, 200])
      ).to.be.revertedWith("Invalid data");

      await expect(
        airdrop.dropTokens([addr1.address, addr2.address], [100])
      ).to.be.revertedWith("Invalid data");
    });

    it("Owner call this method for airdrop", async function () {
      await rvltToken.transfer(airdrop.address, 400);
      await airdrop.dropTokens([addr1.address, addr2.address], [100, 200]);
      let bal = await rvltToken.balanceOf(addr1.address);
      let bal1 = await rvltToken.balanceOf(addr2.address);
      let bal2 = await rvltToken.balanceOf(airdrop.address);
      expect(bal).to.equal(100);
      expect(bal1).to.equal(200);
      expect(bal2).to.equal(100);
    });

    it("Only owners can call this method", async function () {
      await expect(
        airdrop.connect(addr1).dropTokens([addr1.address], [100])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
