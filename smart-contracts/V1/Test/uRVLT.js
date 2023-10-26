const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { time } = require("../utilities");

describe("drvlt contract", function () {
  let Token;
  let stakeToken;
  let rvltToken;
  let uRvltToken;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    Token = await ethers.getContractFactory("RVLT");
    stakeToken = await ethers.getContractFactory("uRevolt");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    const startBlock = await time.latestBlock();

    rvltToken = await upgrades.deployProxy(Token, [owner.address, 100000]);
    await rvltToken.deployed();
    await rvltToken.setTreasuryAddress(owner.address);
    await rvltToken.setWhitelistAddress(addr1.address, true);
    await rvltToken.setWhitelistAddress(addr2.address, true);
    await rvltToken.setWhitelistAddress(addrs[0].address, true);
    await rvltToken.setTax(0);
    uRvltToken = await upgrades.deployProxy(stakeToken, [
      rvltToken.address,
      owner.address,
      owner.address,
      startBlock,
      10,
    ]);
    await uRvltToken.deployed();
  });
  describe("Deployment", function () {
    it("Should set the right owner RVLT token", async function () {
      expect(await rvltToken.owner()).to.equal(owner.address);
    });
    it("Should set the right owner of uRvlt", async function () {
      expect(await uRvltToken.owner()).to.equal(owner.address);
    });
  });
  describe("Add Rvlt pool", function () {
    it("Should revert if non owner tries to add pool", async function () {
      await expect(
        uRvltToken.connect(addr1).add(100, rvltToken.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("Should set the right owner of uRvlt", async function () {
      await uRvltToken.connect(owner).add(100, rvltToken.address, true);
      expect(await uRvltToken.poolLength()).to.equal(1);
    });
  });

  describe("Delegate votes", function () {
    beforeEach(async function () {
      await uRvltToken.connect(owner).add(100, rvltToken.address, true);
      await rvltToken.connect(owner).transfer(addr1.address, 1000);
      await rvltToken.connect(owner).transfer(addr2.address, 1000);
      await rvltToken.connect(owner).approve(uRvltToken.address, 1000);
      await rvltToken.connect(addr1).approve(uRvltToken.address, 1000);
      await rvltToken.connect(addr2).approve(uRvltToken.address, 1000);
      await uRvltToken.connect(owner).deposit(0, 800);
      await uRvltToken.connect(addr1).deposit(0, 900);
      await uRvltToken.connect(addr2).deposit(0, 1000);
    });
    it("User should have zero votes initially", async function () {
      expect(await uRvltToken.getVotes(owner.address)).to.equal(0);
    });
    it("User should have votes after delegate", async function () {
      await uRvltToken.connect(owner).delegate(owner.address);
      expect(await uRvltToken.getVotes(owner.address)).to.equal(800);
    });
    it("User can delegate votes to other users ", async function () {
      await uRvltToken.connect(owner).delegate(addr1.address);
      expect(await uRvltToken.getVotes(addr1.address)).to.equal(800);
    });
    it("Delegated user cannot delegate votes to other users ", async function () {
      await uRvltToken.connect(owner).delegate(addrs[0].address);
      await uRvltToken.connect(addrs[0]).delegate(addr2.address);
      expect(await uRvltToken.getVotes(addr2.address)).to.equal(0);
    });
    it("User votes will reduce on withdraw ", async function () {
      await uRvltToken.connect(owner).delegate(addr1.address);
      await uRvltToken.connect(owner).withdraw(0, 100);
      expect(await uRvltToken.getVotes(addr1.address)).to.equal(700);
    });
    it("Delegated user votes will reduce on withdraw ", async function () {
      await uRvltToken.connect(owner).delegate(addr1.address);
      await uRvltToken.connect(owner).withdraw(0, 100);
      expect(await uRvltToken.getVotes(addr1.address)).to.equal(700);
    });
  });

  describe("Check uRvlt ERC20 token", function () {
    beforeEach(async function () {
      await uRvltToken.connect(owner).add(100, rvltToken.address, true);
      await rvltToken.connect(owner).transfer(addr1.address, 1000);
      await rvltToken.connect(addr1).approve(uRvltToken.address, 1000);
      await uRvltToken.connect(addr1).deposit(0, 1000);
      await rvltToken.connect(owner).transfer(uRvltToken.address, 1000);
    });
    it("User should have should have drvlt token", async function () {
      expect(await uRvltToken.balanceOf(addr1.address)).to.equal(1000);
    });

    it("User should have should have total token supply", async function () {
      const balance = await uRvltToken.balanceOf(addr1.address);
      expect(await uRvltToken.totalSupply()).to.equal(balance);
    });

    it("User should have should have drvlt token after ", async function () {
      await rvltToken.connect(owner).transfer(addr2.address, 1000);
      await rvltToken.connect(addr2).approve(uRvltToken.address, 1000);
      await uRvltToken.connect(addr2).deposit(0, 1000);
      expect(await uRvltToken.balanceOf(addr2.address)).to.equal(1000);
    });
    it("uRVLT token should be burned on withdraw", async function () {
      await uRvltToken.connect(addr1).withdraw(0, 100);
      expect(await uRvltToken.balanceOf(addr1.address)).to.equal(900);
      expect(await uRvltToken.totalSupply()).to.equal(900);

      await uRvltToken.connect(addr1).withdraw(0, 900);
      expect(await uRvltToken.balanceOf(addr1.address)).to.equal(0);
      expect(await uRvltToken.totalSupply()).to.equal(0);
    });
    it("Token should be non transferable", async function () {
      await expect(
        uRvltToken.connect(addr1).transfer(addr2.address, 900)
      ).to.be.revertedWith("Non transferable token");
      await expect(
        uRvltToken.connect(addr1).transfer(uRvltToken.address, 900)
      ).to.be.revertedWith("Non transferable token");
      await expect(
        uRvltToken
          .connect(addr1)
          .transfer("0x0000000000000000000000000000000000000000", 900)
      ).to.be.revertedWith("ERC20: transfer to the zero address");
    });
  });
  describe("Check Rvlt distribution with one user", function () {
    beforeEach(async function () {
      await uRvltToken.connect(owner).add(100, rvltToken.address, true);
      await rvltToken.connect(owner).transfer(addr1.address, 1000);
      await rvltToken.connect(addr1).approve(uRvltToken.address, 1000);
      await uRvltToken.connect(addr1).deposit(0, 1000);
      await rvltToken.connect(owner).transfer(uRvltToken.address, 1000);
    });
    it("User pending should be correct", async function () {
      expect(await uRvltToken.pendingRVLT(0, addr1.address)).to.equal(1000);
    });
    it("User can claim token", async function () {
      const beforeClaimBalance = await rvltToken.balanceOf(addr1.address);
      expect(beforeClaimBalance).to.equal(0);
      await time.advanceBlock();
      await uRvltToken.connect(addr1).claimRVLT(0);
      const afterClaimBalance = await rvltToken.balanceOf(addr1.address);
      expect(afterClaimBalance).to.equal(1000);
    });

    it("Second cannot claim for deposit/stake after reward send to contract", async function () {
      await rvltToken.connect(owner).transfer(addr2.address, 1000);
      await rvltToken.connect(addr2).approve(uRvltToken.address, 1000);
      await uRvltToken.connect(addr2).deposit(0, 1000);
      await time.advanceBlock();
      expect(await uRvltToken.pendingRVLT(0, addr2.address)).to.equal(0);
      const beforeClaimBalance = await rvltToken.balanceOf(addr2.address);
      expect(beforeClaimBalance).to.equal(0);
      await uRvltToken.connect(addr2).claimRVLT(0);
      const afterClaimBalance = await rvltToken.balanceOf(addr2.address);
      expect(afterClaimBalance).to.equal(0);
    });

    it("User rewards will be claimed during deposit", async function () {
      await rvltToken.connect(owner).transfer(addr1.address, 10);
      await rvltToken.connect(addr1).approve(uRvltToken.address, 10);
      await time.advanceBlock();
      expect(await uRvltToken.pendingRVLT(0, addr1.address)).to.equal(1000);
      const beforeClaimBalance = await rvltToken.balanceOf(addr1.address);
      expect(beforeClaimBalance).to.equal(10);
      await uRvltToken.connect(addr1).deposit(0, 10);
      const afterClaimBalance = await rvltToken.balanceOf(addr1.address);
      expect(afterClaimBalance).to.equal(1000);
    });
  });

  describe("Check Rvlt distribution with multiple address user", function () {
    beforeEach(async function () {
      await uRvltToken.connect(owner).add(100, rvltToken.address, true);
      await rvltToken.connect(owner).transfer(addr1.address, 1000);
      await rvltToken.connect(addr1).approve(uRvltToken.address, 1000);
      await uRvltToken.connect(addr1).deposit(0, 1000);
      await rvltToken.connect(owner).transfer(addr2.address, 1000);
      await rvltToken.connect(addr2).approve(uRvltToken.address, 1000);
      await uRvltToken.connect(addr2).deposit(0, 1000);
      await rvltToken.connect(owner).transfer(uRvltToken.address, 1000);
    });
    it("User first pending should be correct", async function () {
      expect(await uRvltToken.pendingRVLT(0, addr1.address)).to.equal(500);
    });
    it("User second pending should be correct", async function () {
      expect(await uRvltToken.pendingRVLT(0, addr2.address)).to.equal(500);
    });
    it("User first should claim half Reward", async function () {
      const beforeClaimBalance = await rvltToken.balanceOf(addr1.address);
      expect(beforeClaimBalance).to.equal(0);
      await time.advanceBlock();
      await uRvltToken.connect(addr1).claimRVLT(0);
      const afterClaimBalance = await rvltToken.balanceOf(addr1.address);
      expect(afterClaimBalance).to.equal(500);
    });
    it("User second should claim half Reward", async function () {
      const beforeClaimBalance = await rvltToken.balanceOf(addr2.address);
      expect(beforeClaimBalance).to.equal(0);
      await time.advanceBlock();
      await uRvltToken.connect(addr2).claimRVLT(0);
      const afterClaimBalance = await rvltToken.balanceOf(addr2.address);
      expect(afterClaimBalance).to.equal(500);
    });

    it("Second cannot claim extra rewards for deposit/stake after reward send to contract", async function () {
      await rvltToken.connect(owner).transfer(addr2.address, 1000);
      await rvltToken.connect(addr2).approve(uRvltToken.address, 1000);
      await uRvltToken.connect(addr2).deposit(0, 1000);
      await time.advanceBlock();
      expect(await uRvltToken.pendingRVLT(0, addr2.address)).to.equal(0);
      const beforeClaimBalance = await rvltToken.balanceOf(addr1.address);
      expect(beforeClaimBalance).to.equal(0);
      await uRvltToken.connect(addr1).claimRVLT(0);
      const afterClaimBalance = await rvltToken.balanceOf(addr2.address);
      expect(afterClaimBalance).to.equal(500);
    });

    it("Second cannot claim after withdrawal", async function () {
      expect(await uRvltToken.pendingRVLT(0, addr2.address)).to.equal(500);
      const beforeClaimBalance = await rvltToken.balanceOf(addr2.address);
      expect(beforeClaimBalance).to.equal(0);
      await uRvltToken.connect(addr2).withdraw(0, 1000);
      const afterClaimBalance = await rvltToken.balanceOf(addr2.address);
      expect(afterClaimBalance).to.equal(1500);
      expect(await uRvltToken.pendingRVLT(0, addr2.address)).to.equal(0);
      expect(await uRvltToken.pendingRVLT(0, addr1.address)).to.equal(500);
      await rvltToken.connect(owner).transfer(uRvltToken.address, 1000);
      expect(await uRvltToken.pendingRVLT(0, addr2.address)).to.equal(0);
      expect(await uRvltToken.pendingRVLT(0, addr1.address)).to.equal(1500);
      await uRvltToken.connect(addr1).claimRVLT(0);
      expect(await rvltToken.balanceOf(addr1.address)).to.equal(1500);
      await uRvltToken.connect(addr2).claimRVLT(0);
      expect(await rvltToken.balanceOf(addr2.address)).to.equal(1500);
    });

    it("Third user can only claim rewards after deposit", async function () {
      await rvltToken.connect(owner).transfer(addrs[0].address, 2000);
      await rvltToken.connect(addrs[0]).approve(uRvltToken.address, 2000);
      await time.advanceBlock();
      // Third user reward will always 0 before
      expect(await uRvltToken.pendingRVLT(0, addrs[0].address)).to.equal(0);

      await uRvltToken.connect(addrs[0]).deposit(0, 2000);
      expect(await uRvltToken.pendingRVLT(0, addrs[0].address)).to.equal(0);
      await rvltToken.connect(owner).transfer(uRvltToken.address, 2000);
      expect(await uRvltToken.pendingRVLT(0, addr1.address)).to.equal(1000);
      expect(await uRvltToken.pendingRVLT(0, addr2.address)).to.equal(1000);
      expect(await uRvltToken.pendingRVLT(0, addrs[0].address)).to.equal(1000);

      const beforeClaimBalance = await rvltToken.balanceOf(addrs[0].address);
      expect(beforeClaimBalance).to.equal(0);
      await uRvltToken.connect(addrs[0]).claimRVLT(0);
      const afterClaimBalance = await rvltToken.balanceOf(addrs[0].address);
      expect(afterClaimBalance).to.equal(1000);

      await uRvltToken.connect(addrs[0]).withdraw(0, 1000);
      await rvltToken.connect(owner).transfer(uRvltToken.address, 3000);
      expect(await uRvltToken.pendingRVLT(0, addr1.address)).to.equal(2000);
      expect(await uRvltToken.pendingRVLT(0, addr2.address)).to.equal(2000);
      expect(await uRvltToken.pendingRVLT(0, addrs[0].address)).to.equal(1000);
    });
  });
});
