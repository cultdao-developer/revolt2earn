const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { time } = require("../utilities");

describe("Treasury contract", function () {
  let Token;
  let governanceToken;
  let rvltToken;
  let governance;
  let swapContract;
  let swap;
  let treasuryContract;
  let treasury;
  let usdc;
  let usdcToken;
  let mockURevolt;
  let uRVLT;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    Token = await ethers.getContractFactory("RVLT");
    governanceToken = await ethers.getContractFactory("GovernorBravoDelegate");
    swapContract = await ethers.getContractFactory("UniswapV2RouterMock");
    treasuryContract = await ethers.getContractFactory("Treasury");
    mockURevolt = await ethers.getContractFactory("MockURevolt");
    usdc = await ethers.getContractFactory("MockToken");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    swap = await swapContract.deploy();
    usdcToken = await usdc.deploy("USDC", "USDC");

    rvltToken = await upgrades.deployProxy(Token, [
      owner.address,
      "100000000000000000000000",
    ]);
    await rvltToken.deployed();

    uRVLT = await mockURevolt.deploy(rvltToken.address);

    treasury = await upgrades.deployProxy(treasuryContract, [
      rvltToken.address,
      swap.address,
      usdcToken.address,
      owner.address,
    ]);
    await treasury.deployed();

    governance = await upgrades.deployProxy(governanceToken, [
      addr2.address,
      rvltToken.address,
      120,
      treasury.address,
      300,
      100,
    ]);
    await governance.deployed();
    await rvltToken.setTreasuryAddress(treasury.address);
  });
  describe("Deployment", function () {
    it("Should set the right owner RVLT token", async function () {
      expect(await rvltToken.owner()).to.equal(owner.address);
    });
    it("Should set the right owner of governance", async function () {
      expect(await governance.admin()).to.equal(addr2.address);
    });
  });

  describe("Check Fees", function () {
    it("0.4 percent should be deducted on transfer from one account to another account", async function () {
      await treasury.connect(owner).setDAOAddress(governance.address);
      await rvltToken.transfer(addr1.address, 1000);
      expect(await rvltToken.balanceOf(addr1.address)).to.equal(996);
      expect(await rvltToken.balanceOf(treasury.address)).to.equal(4);
    });
    it("No fees for whitelisted", async function () {
      await rvltToken.setWhitelistAddress(addr1.address, true);
      await rvltToken.transfer(addr1.address, 1000);
      expect(await rvltToken.balanceOf(addr1.address)).to.equal(1000);
      expect(await rvltToken.balanceOf(treasury.address)).to.equal(0);
    });

    it("Only owners can whitelist", async function () {
      await expect(
        rvltToken.connect(addr1).setWhitelistAddress(addr1.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Add Investee", function () {
    it("Only admin/Timelock can add", async function () {
      await expect(
        governance.connect(addr1)._setInvesteeDetails(addr1.address, 100)
      ).to.be.revertedWith("GovernorBravo::_setInvesteeDetails: admin only");
    });
    it("Should add from admin account", async function () {
      await governance.connect(addr2)._setInvesteeDetails(addr1.address, 100);
      const investeeDetail = await governance.investeeDetails(0);
      expect(addr1.address).to.equal(investeeDetail._investee);
      expect(100).to.equal(investeeDetail._fundAmount);
      expect(await governance.nextInvestee()).to.equal(1);
    });

    it("Multiple investee", async function () {
      await governance.connect(addr2)._setInvesteeDetails(addr1.address, 100);
      const investeeDetails1 = await governance.investeeDetails(0);
      expect(addr1.address).to.equal(investeeDetails1._investee);
      expect(100).to.equal(investeeDetails1._fundAmount);
      expect(await governance.nextInvestee()).to.equal(1);
      await governance.connect(addr2)._setInvesteeDetails(addr2.address, 200);
      const investeeDetails2 = await governance.investeeDetails(1);
      expect(addr2.address).to.equal(investeeDetails2._investee);
      expect(200).to.equal(investeeDetails2._fundAmount);
      expect(await governance.nextInvestee()).to.equal(2);
    });
  });

  describe("Fund Investee", function () {
    beforeEach(async function () {
      await treasury.connect(owner).setDAOAddress(governance.address);
      await treasury.connect(owner).setuRVLTAddress(uRVLT.address);
      await treasury.connect(owner).setMultiSignAddress(addrs[1].address);
      await governance.connect(addr2)._setInvesteeDetails(addr1.address, 100);
      await governance.connect(addr2)._setInvesteeDetails(addrs[0].address, 200);
    });
    it("Only treasury can fund", async function () {
      await expect(
        governance.connect(addr1)._fundInvestee()
      ).to.be.revertedWith("GovernorBravo::_fundInvestee: treasury only");
    });
    it("Should fund investee ", async function () {
      await rvltToken
        .connect(owner)
        .transfer(treasury.address, "40000000000000000000");
      await rvltToken.connect(owner).transfer(addr2.address, "10");
      expect(await rvltToken.balanceOf(addr1.address)).to.equal(
        "400000000000000000"
      );
      expect(
        await rvltToken.balanceOf("0x000000000000000000000000000000000000dEaD")
      ).to.equal("250000000000000000");
    });
    it("Should fund to other investee ", async function () {
      await rvltToken
        .connect(owner)
        .transfer(treasury.address, "40000000000000000000");
      await rvltToken.connect(owner).transfer(addr2.address, "10");
      await rvltToken.connect(owner).transfer(addr2.address, "10");
      expect(await rvltToken.balanceOf(addrs[0].address)).to.equal(
        "400000000000000000"
      );
      expect(
        await rvltToken.balanceOf("0x000000000000000000000000000000000000dEaD")
      ).to.equal("500000000000000000");
    });
    it("Should update the mapping", async function () {
      await rvltToken
        .connect(owner)
        .transfer(treasury.address, "80000000000000000000");
      await rvltToken.connect(owner).transfer(addr2.address, "10");
      expect(await governance.nextInvesteeFund()).to.equal("1");
      await rvltToken.connect(owner).transfer(addr2.address, "10");
      expect(await governance.nextInvesteeFund()).to.equal("2");
      await rvltToken.connect(owner).transfer(addr2.address, "10");
      expect(await governance.nextInvesteeFund()).to.equal("2");
      expect(await rvltToken.balanceOf(addrs[0].address)).to.equal(
        "400000000000000000"
      );
      expect(
        await rvltToken.balanceOf("0x000000000000000000000000000000000000dEaD")
      ).to.equal("500000000000000000");
    });
  });
});

