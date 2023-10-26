const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { time } = require("./utils/index");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

function encodeLeaf(address, spots) {
  // const abi = ethers.utils.defaultAbiCoder;
  // Same as `abi.encodePacked` in Solidity
  return ethers.utils.solidityKeccak256(
    ["address", "uint256"], // The datatypes of arguments to encode
    [address, spots]// The actual values
  )
}

describe("EthContribution contract", function () {
  let InvestContract;
  let MockContract;
  let oldRVLT;
  let newRVLT;
  let uRVLT;
  let invest;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let addrs;

  let addresses;
  let leafnodes;
  let leaf;
  let tree;
  let root;
  let proof;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    InvestContract = await ethers.getContractFactory("RVLTSwap");
    MockContract = await ethers.getContractFactory("MockToken");
    MockTokenRVLT = await ethers.getContractFactory("MockTokenRVLT");
    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

    oldRVLT = await upgrades.deployProxy(MockContract, ["MockTest", "TST"]);
    await oldRVLT.deployed();

    newRVLT = await upgrades.deployProxy(MockTokenRVLT, ["uRVLT", "uRVLT"]);
    await newRVLT.deployed();

    uRVLT = await upgrades.deployProxy(MockContract, ["MockTest", "TST"]);
    await uRVLT.deployed();

    invest = await upgrades.deployProxy(InvestContract, [
      oldRVLT.address,
      newRVLT.address,
      uRVLT.address
    ]);
    await invest.deployed();
  });

  describe("Initial configuration", function () {
    it("Should set the right owner", async function () {
      expect(await invest.owner()).to.equal(owner.address);
    });
  });

  describe("Check owner condition", function () {
    beforeEach("", async function () {
      addresses = [owner.address, addr1.address, addr2.address];
      leafnodes = addresses.map((addr) => keccak256(addr));
      tree = new MerkleTree(leafnodes, keccak256, { sort: true });
      leaf = keccak256(owner.address);
      root = tree.getHexRoot();
    });

    it("Should non owner tries to setMerkleRootuRVLT", async function () {
      await expect(invest.connect(addr1).setMerkleRootuRVLT(root)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should non owner tries to call setMerkleRootRVLT", async function () {
      await expect(invest.connect(addr1).setMerkleRootRVLT(root)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should non owner tries to call setSwapuRVLTStatus", async function () {
      await expect(
        invest.connect(addr1).setSwapuRVLTStatus(true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Claim RVLT", function () {
    beforeEach("", async function () {
      const leafnodes = [
        encodeLeaf(owner.address, 1000),
        encodeLeaf(addr2.address, 100),
        encodeLeaf(addr1.address, 500)
      ];

      tree = new MerkleTree(leafnodes, keccak256, { sort: true });
      leaf = encodeLeaf(owner.address, 1000);
      leaf1 = encodeLeaf(addr1.address, 500);
      leaf2 = encodeLeaf(addr2.address, 100);
      leaf3 = encodeLeaf(addr3.address, 50);
      root = tree.getHexRoot();

      proof = tree.getHexProof(leaf);
      proof1 = tree.getHexProof(leaf1);
      proof2 = tree.getHexProof(leaf2);
      proof3 = tree.getHexProof(leaf3);

      await invest.setMerkleRootRVLT(root);
    });

    it("Claim by add1 with wrong amount", async function () {
      await expect(invest.connect(addr1).claimRVLT(501, proof1)).to.be.revertedWith("Not Whitelisted");
    });

    it("Claim by add1 with correct amount but have not approve tokens", async function () {
      await expect(invest.connect(addr1).claimRVLT(500, proof1)).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Claim by add1 with correct amount but not have tokens", async function () {
      await oldRVLT.connect(addr1).approve(invest.address, 10000);
      await expect(invest.connect(addr1).claimRVLT(500, proof1)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Claim by add1 with correct amount but contract have not new tokens", async function () {
      await oldRVLT.connect(addr1).approve(invest.address, 10000);
      await oldRVLT.connect(owner).mint(addr1.address, 500);
      await expect(invest.connect(addr1).claimRVLT(500, proof1)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Claim by add1 with correct amount but contract have new tokens", async function () {
      await oldRVLT.connect(addr1).approve(invest.address, 10000);
      await oldRVLT.connect(owner).mint(addr1.address, 500);
      await newRVLT.connect(owner).mint(invest.address, 10000);

      await invest.connect(addr1).claimRVLT(500, proof1);

      let oldRVLTBal = await oldRVLT.balanceOf(addr1.address);
      let newRVLTBal = await newRVLT.balanceOf(addr1.address);
      expect(oldRVLTBal).to.be.equals(0);
      expect(newRVLTBal).to.be.equals(500);

      let userinfo = await invest.userInfoRVLT(addr1.address);
      expect(userinfo[0]).to.be.equals(500);
      expect(userinfo[1]).to.be.equals(true);

      let _status = await invest.isUserClaimedRVLT(addr1.address);
      expect(_status).to.be.equals(true);
    });

    it("Claim by add1 with correct amount but contract have new tokens(Try to claim again)", async function () {
      await oldRVLT.connect(addr1).approve(invest.address, 10000);
      await oldRVLT.connect(owner).mint(addr1.address, 510);
      await newRVLT.connect(owner).mint(invest.address, 10000);

      await invest.connect(addr1).claimRVLT(500, proof1);
      await expect(invest.connect(addr1).claimRVLT(500, proof1)).to.be.revertedWith("Already claimed");
    });

    it("if user blacklisted", async function () {
      await invest.connect(owner).updateBlacklistUser(addr1.address, true);

      await oldRVLT.connect(addr1).approve(invest.address, 10000);
      await oldRVLT.connect(owner).mint(addr1.address, 510);
      await newRVLT.connect(owner).mint(invest.address, 10000);

      await expect(invest.connect(addr1).claimRVLT(500, proof1)).to.be.revertedWith("Not allowed to claim");
    });
  
    it("if not whitlisted user try to claim ", async function () {
      await expect(invest.connect(addr3).claimRVLT(50, proof3)).to.be.revertedWith("Not Whitelisted");
    });

    it("if other user try to claim with whitlisted user proof", async function () {
      await expect(invest.connect(addr3).claimRVLT(500, proof1)).to.be.revertedWith("Not Whitelisted");
    });
  });

  describe("Claim uRVLT", function () {
    beforeEach("", async function () {
      const leafnodes = [
        encodeLeaf(owner.address, 1000),
        encodeLeaf(addr2.address, 100),
        encodeLeaf(addr1.address, 500)
      ];

      tree = new MerkleTree(leafnodes, keccak256, { sort: true });
      leaf = encodeLeaf(owner.address, 1000);
      leaf1 = encodeLeaf(addr1.address, 500);
      leaf2 = encodeLeaf(addr2.address, 100);
      leaf3 = encodeLeaf(addr3.address, 50);
      root = tree.getHexRoot();

      proof = tree.getHexProof(leaf);
      proof1 = tree.getHexProof(leaf1);
      proof2 = tree.getHexProof(leaf2);
      proof3 = tree.getHexProof(leaf3);

      await invest.setMerkleRootuRVLT(root);
    });

    it("Claim by add1 with wrong amount", async function () {
      await expect(invest.connect(addr1).claimuRVLT(501, proof1)).to.be.revertedWith("Not Whitelisted");
    });

    it("Claim by add1 with correct amount but have not approve tokens", async function () {
      await expect(invest.connect(addr1).claimuRVLT(500, proof1)).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Claim by add1 with correct amount but not have tokens", async function () {
      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await expect(invest.connect(addr1).claimuRVLT(500, proof1)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Claim by add1 with correct amount but contract have not new tokens", async function () {
      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await uRVLT.connect(owner).mint(addr1.address, 500);
      await expect(invest.connect(addr1).claimuRVLT(500, proof1)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Claim by add1 with correct amount but contract have new tokens", async function () {
      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await uRVLT.connect(owner).mint(addr1.address, 500);
      await newRVLT.connect(owner).mint(invest.address, 10000);

      await invest.connect(addr1).claimuRVLT(500, proof1);

      let uRVLTBal = await uRVLT.balanceOf(addr1.address);
      let newRVLTBal = await newRVLT.balanceOf(addr1.address);
      expect(uRVLTBal).to.be.equals(0);
      expect(newRVLTBal).to.be.equals(500);

      let userinfo = await invest.userInfouRVLT(addr1.address);
      expect(userinfo[0]).to.be.equals(500);
      expect(userinfo[1]).to.be.equals(true);

      let _status = await invest.isUserClaimeduRVLT(addr1.address);
      expect(_status).to.be.equals(true);
    });

    it("Claim by add1 with correct amount but contract have new tokens(Try to claim again)", async function () {
      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await uRVLT.connect(owner).mint(addr1.address, 510);
      await newRVLT.connect(owner).mint(invest.address, 10000);

      await invest.connect(addr1).claimuRVLT(500, proof1);
      await expect(invest.connect(addr1).claimuRVLT(500, proof1)).to.be.revertedWith("Already claimed");
    });

    it("if user blacklisted", async function () {
      await invest.connect(owner).updateBlacklistUser(addr1.address, true);

      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await uRVLT.connect(owner).mint(addr1.address, 510);
      await newRVLT.connect(owner).mint(invest.address, 10000);

      await expect(invest.connect(addr1).claimuRVLT(500, proof1)).to.be.revertedWith("Not allowed to claim");
    });

    it("if not whitlisted user try to claim ", async function () {
      await expect(invest.connect(addr3).claimuRVLT(50, proof3)).to.be.revertedWith("Not Whitelisted");
    });

    it("if other user try to claim with whitlisted user proof", async function () {
      await expect(invest.connect(addr3).claimuRVLT(500, proof1)).to.be.revertedWith("Not Whitelisted");
    });
  });

  describe("Swap uRVLT", function () {
    it("Claim by add1 with correct amount but have not approve tokens", async function () {
      await invest.connect(owner).setSwapuRVLTStatus(true);
      await expect(invest.connect(addr1).swapuRVLT(500)).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Claim by add1 with correct amount but not have tokens", async function () {
      await invest.connect(owner).setSwapuRVLTStatus(true);

      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await expect(invest.connect(addr1).swapuRVLT(500)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Claim by add1 with correct amount but contract have not new tokens", async function () {
      await invest.connect(owner).setSwapuRVLTStatus(true);

      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await uRVLT.connect(owner).mint(addr1.address, 500);
      await expect(invest.connect(addr1).swapuRVLT(500)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Claim by add1 with correct amount but contract have new tokens", async function () {
      await invest.connect(owner).setSwapuRVLTStatus(true);

      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await uRVLT.connect(owner).mint(addr1.address, 500);
      await newRVLT.connect(owner).mint(invest.address, 10000);

      await invest.connect(addr1).swapuRVLT(500);

      let uRVLTBal = await uRVLT.balanceOf(addr1.address);
      let newRVLTBal = await newRVLT.balanceOf(addr1.address);
      expect(uRVLTBal).to.be.equals(0);
      expect(newRVLTBal).to.be.equals(500);

      let userinfo = await invest.userInfouRVLT(addr1.address);
      expect(userinfo[0]).to.be.equals(500);
      expect(userinfo[1]).to.be.equals(true);

      let _status = await invest.isUserClaimeduRVLT(addr1.address);
      expect(_status).to.be.equals(false);
    });

    it("Claim by add1 with correct amount but contract have new tokens(Try to claim again)", async function () {
      await invest.connect(owner).setSwapuRVLTStatus(true);
      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await uRVLT.connect(owner).mint(addr1.address, 1000);
      await newRVLT.connect(owner).mint(invest.address, 10000);

      await invest.connect(addr1).swapuRVLT(500);
      await invest.connect(addr1).swapuRVLT(500);
    });

    it("if user blacklisted", async function () {
      await invest.connect(owner).setSwapuRVLTStatus(true);
      await invest.connect(owner).updateBlacklistUser(addr1.address, true);

      await uRVLT.connect(addr1).approve(invest.address, 10000);
      await uRVLT.connect(owner).mint(addr1.address, 510);
      await newRVLT.connect(owner).mint(invest.address, 10000);

      await expect(invest.connect(addr1).swapuRVLT(500)).to.be.revertedWith("Not allowed to claim");
    });

    it("if not allow swap ", async function () {
      await expect(invest.connect(addr1).swapuRVLT(50, proof3)).to.be.revertedWith("Not Allow");
    });
  });
});
