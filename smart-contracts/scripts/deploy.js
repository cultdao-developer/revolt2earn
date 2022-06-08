const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address", deployer.address);

  const RouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  const usdcToken = await ethers.getContractFactory("MockToken");
  const USDC = await usdcToken.deploy("USDC", "USDC");
  console.log("usdc :- ", USDC.address);

  const Token = await ethers.getContractFactory("RVLT");
  const governanceToken = await ethers.getContractFactory(
    "GovernorBravoDelegate"
  );
  const treasuryContract = await ethers.getContractFactory("Treasury");
  const timeLockContract = await ethers.getContractFactory("Timelock");
  const uRvltContract = await ethers.getContractFactory("uRevolt");

  const rvltToken = await upgrades.deployProxy(Token, [
    deployer.address,
    "6666666666666000000000000000000",
  ]);
  await rvltToken.deployed();
  console.log("rvlt Token ", rvltToken.address);
  
  const uRvltToken = await upgrades.deployProxy(uRvltContract, [
    rvltToken.address,
    deployer.address,
    deployer.address,
    100,
    3,
  ]);

  await uRvltToken.deployed();
  console.log("uRvlt Token ", uRvltToken.address);

  const treasury = await upgrades.deployProxy(treasuryContract, [
    rvltToken.address,
    RouterAddress,
    USDC.address,
  ]);
  await treasury.deployed();
  console.log("Treasury Token ", treasury.address);

  const timelock = await upgrades.deployProxy(timeLockContract, [
    deployer.address,
    10,
  ]);
  await timelock.deployed();
  console.log("Timelock Token ", timelock.address);

  const governance = await upgrades.deployProxy(governanceToken, [
    timelock.address,
    uRvltToken.address,
    300,
    treasury.address,
    "200",
    "100000000000000000000",
  ]);
  console.log("Governance Token ", governance.address);
}

main();
