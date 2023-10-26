const { ethers, upgrades } = require("hardhat");

async function main() {
  // Get the Address from Ganache Chain to deploy.
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address", deployer.address);

  const RVLTContract = await ethers.getContractFactory("RVLTSwap");
  const MockToken = await ethers.getContractFactory("MockToken");
  const MockTokenRVLT = await ethers.getContractFactory("MockTokenRVLT");

  const oldRVLT = await upgrades.deployProxy(
    MockToken,
    ["OldRVLT", "oldRVLT"]
  );
  await oldRVLT.deployed();
  console.log("oldRVLT deployed to:", oldRVLT.address);

  const uRVLT = await upgrades.deployProxy(
    MockTokenRVLT,
    ["uRVLT", "uRVLT"]
  );
  await uRVLT.deployed();
  console.log("uRVLT deployed to:", uRVLT.address);

  const newRVLT = await upgrades.deployProxy(
    MockTokenRVLT,
    ["NRVLT", "NRVLT"]
  );
  await newRVLT.deployed();
  console.log("newRVLT deployed to:", newRVLT.address);

  // Deploy RVLT Swap
  const swap = await upgrades.deployProxy(
    RVLTContract,
    [oldRVLT.address, newRVLT.address, uRVLT.address]
  );
  await swap.deployed();
  console.log("RVLTSwap deployed to:", swap.address);
}

main();
