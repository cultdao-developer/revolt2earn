const { parse } = require("@ethersproject/transactions");
const { contract, privateKeys } = require("@openzeppelin/test-environment");
const {
  BN,
  expectRevert,
  expectEvent,
  constants,
  time,
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { signTypedData } = require("eth-sig-util");

const {
  address,
  etherMantissa,
  encodeParameters,
  mineBlock,
} = require("../utilities/Ethereum");
const ether = require('@openzeppelin/test-helpers/src/ether')

let ownerAddress;
let userAddress1;
let userAddress2;
const GovernorBravoDelegate = artifacts.require("GovernorBravoDelegate");
const RVLTToken = artifacts.require("RVLT");
const Timelock = artifacts.require("Timelock");
const uRVLTToken = artifacts.require("MockURevolt");
const mockTreasury = artifacts.require("MockTreasury");;

describe("GovernorBravo_Propose", function () {
  let trivialProposal, targets, values, signatures, callDatas, delay;
  let proposalBlock;
  //   const [ ownerAddress, userAddress1, userAddress2] = accounts;
  beforeEach(async function () {
    const startBlock = await time.latestBlock();
    accounts = await web3.eth.getAccounts();
    [ownerAddress, userAddress1, userAddress2] = accounts;
    delay = new BN(2 * 24 * 60 * 60 * 2);

    this.RVLT = await RVLTToken.new({ from: ownerAddress, gas: 8000000 });
    this.RVLT.initialize(ownerAddress, "6666666666666666666666666666666", {
      from: ownerAddress,
      gas: 8000000,
    });
    this.timelock = await Timelock.new(ownerAddress, delay, {
      from: ownerAddress,
      gas: 8000000,
    });
    this.uRvltToken = await uRVLTToken.new(this.RVLT.address, {
      from: ownerAddress,
      gas: 8000000,
    });
    this.treasury = await mockTreasury.new({ from: ownerAddress });
    await this.RVLT.setWhitelistAddress(ownerAddress, true, {
      from: ownerAddress,
    });
    await this.RVLT.setWhitelistAddress(userAddress1, true, {
      from: ownerAddress,
    });
    await this.RVLT.setWhitelistAddress(userAddress2, true, {
      from: ownerAddress,
    });

    await this.RVLT.approve(this.uRvltToken.address, 10000, {
      from: ownerAddress,
      gas: 8000000,
    });
    await this.RVLT.transfer(userAddress1, 10000, {
      from: ownerAddress,
      gas: 8000000,
    });
    await this.RVLT.approve(this.uRvltToken.address, 10000, {
      from: userAddress1,
      gas: 8000000,
    });
    await this.uRvltToken.mint(ownerAddress, 1000);
    await this.uRvltToken.mint(userAddress1, 900);
    await this.uRvltToken.delegate(userAddress1, {
      from: userAddress1,
      gas: 8000000,
    });
    await this.timelock.initialize(ownerAddress, delay, {
      from: ownerAddress,
      gas: 8000000,
    });
    this.gov = await GovernorBravoDelegate.new(
      { from: ownerAddress, gas: 8000000 }
    );
    await this.gov.initialize(
      this.timelock.address,
      this.uRvltToken.address,
      300,
      this.treasury.address,
      120,
      100,
      { from: ownerAddress, gas: 8000000 }
    );
    await this.timelock.setPendingAdmin(this.gov.address, {
      from: ownerAddress,
      gas: 8000000,
    });
    await this.gov._AcceptTimelockAdmin({ from: ownerAddress, gas: 8000000 });
    await this.RVLT.delegate(userAddress1, { from: ownerAddress });

    targets = [ownerAddress];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    callDatas = [encodeParameters(["address"], [userAddress1])];
    await this.treasury.updatePrice(100);
    await this.gov.propose(
      targets,
      values,
      signatures,
      callDatas,
      "do nothing",
      { from: ownerAddress, gas: 8000000 }
    );
    proposalBlock = await time.latestBlock();
    proposalId = await this.gov.latestProposalIds(ownerAddress);
    trivialProposal = await this.gov.proposals(proposalId);
  });

  describe("Failed if not hold enough uRVLT", function () {
    it("", async function () {
      await this.treasury.updatePrice(0);
      await expectRevert(
        this.gov.propose(
          targets.concat(ownerAddress),
          values,
          signatures,
          callDatas,
          "do nothing",
          { from: userAddress1, gas: 8000000 }
        ),
        "GovernorBravo::propose: only uRvlt holders with enough balance"
      );
    });
  });

  describe("simple initialization", function () {
    it("ID is set to a globally unique identifier", async function () {
      expect(trivialProposal.id).to.be.bignumber.equal(new BN(proposalId));
    });

    it("Proposer is set to the sender", async function () {
      expect(trivialProposal.proposer).to.equal(ownerAddress);
    });

    it("ForVotes and AgainstVotes are initialized to zero", async function () {
      expect(trivialProposal.forVotes).to.be.bignumber.equal(new BN(0));
      expect(trivialProposal.againstVotes).to.be.bignumber.equal(new BN(0));
    });

    it("Executed and Canceled flags are initialized to false", async function () {
      expect(trivialProposal.canceled).to.equal(false);
      expect(trivialProposal.executed).to.equal(false);
    });

    it("ETA is initialized to zero", async function () {
      expect(trivialProposal.eta).to.be.bignumber.equal(new BN(0));
    });

    it("Targets, Values, Signatures, Calldatas are set according to parameters", async function () {
      const dynamicFields = await this.gov.getActions(trivialProposal.id);

      expect(dynamicFields[0][0]).to.equal(targets[0]);
      expect(dynamicFields[1][0]).to.be.bignumber.equal(new BN(values[0]));
      expect(dynamicFields[2][0]).to.equal(signatures[0]);
      expect(dynamicFields[3][0]).to.equal(callDatas[0]);
    });

    describe("This function must revert if", function () {
      it("the length of the values, signatures or calldatas arrays are not the same length,", async function () {
        await expectRevert(
          this.gov.propose(
            targets.concat(ownerAddress),
            values,
            signatures,
            callDatas,
            "do nothing",
            { from: ownerAddress, gas: 8000000 }
          ),
          "GovernorBravo::propose: proposal function information arity mismatch"
        );

        await expectRevert(
          this.gov.propose(
            targets,
            values.concat(values),
            signatures,
            callDatas,
            "do nothing",
            { from: ownerAddress, gas: 8000000 }
          ),
          "GovernorBravo::propose: proposal function information arity mismatch"
        );

        await expectRevert(
          this.gov.propose(
            targets,
            values,
            signatures.concat(signatures),
            callDatas,
            "do nothing",
            { from: ownerAddress, gas: 8000000 }
          ),
          "GovernorBravo::propose: proposal function information arity mismatch"
        );

        await expectRevert(
          this.gov.propose(
            targets,
            values,
            signatures,
            callDatas.concat(callDatas),
            "do nothing",
            { from: ownerAddress, gas: 8000000 }
          ),
          "GovernorBravo::propose: proposal function information arity mismatch"
        );
      });

      it("Failed to create proposal after proposal period end.", async function () {
        await this.gov.cancel(trivialProposal.id, {
          from: ownerAddress,
          gas: 8000000,
        });
        await ethers.provider.send('evm_increaseTime', [125]);
        await ethers.provider.send('evm_mine');
        await expectRevert(
          this.gov.propose(targets, values, signatures, callDatas, "do nothing", {
            from: ownerAddress,
            gas: 8000000,
          }),
          "GovernorBravo::propose: invalid proposal creating time"
        );
      });

      it("or if that length is zero or greater than Max Operations.", async function () {
        await expectRevert(
          this.gov.propose([], [], [], [], "do nothing", {
            from: ownerAddress,
            gas: 8000000,
          }),
          "GovernorBravo::propose: must provide actions"
        );
      });

      describe("Additionally, if there exists a pending or active proposal from the same proposer, we must revert.", function () {
        it("reverts with pending", async function () {
          await expectRevert(
            this.gov.propose(
              targets,
              values,
              signatures,
              callDatas,
              "do nothing",
              { from: ownerAddress, gas: 8000000 }
            ),
            "GovernorBravo::propose: one live proposal per proposer, found an already pending proposal"
          );
        });
      });
    });
  });

  describe("GovernorBravo#state/1", function () {
    it("Invalid for proposal not found", async function () {
      await expectRevert(
        this.gov.state(5),
        "GovernorBravo::state: invalid proposal id"
      );
    });

    it("Pending", async function () {
      expect(await this.gov.state(trivialProposal.id)).to.be.bignumber.equal(
        new BN(0)
      );
    });

    it("Active", async function () {
      await this.gov.cancel(trivialProposal.id, {
        from: ownerAddress,
        gas: 8000000,
      });
      await time.increaseTo(Number(await this.gov.governanceStartTime()) + Number(125));
      expect(await this.gov.state(trivialProposal.id)).to.be.bignumber.equal(
        new BN(2)
      );
    });

    it("Canceled", async function () {
      await this.gov.cancel(trivialProposal.id, {
        from: ownerAddress,
        gas: 8000000,
      });
      expect(await this.gov.state(trivialProposal.id)).to.be.bignumber.equal(
        new BN(2)
      );
    });
  });

  describe("Caste Vote", function () {
    it("Caste Vote(True)", async function () {
      await this.uRvltToken.updateiCultMandator(userAddress1, true, {
        from: ownerAddress,
        gas: 8000000,
      });
      await this.gov.cancel(trivialProposal.id, {
        from: ownerAddress,
        gas: 8000000,
      });
      await this.gov.propose(targets, values, signatures, callDatas, "do nothing", {
        from: ownerAddress,
        gas: 8000000,
      });
      await ethers.provider.send('evm_increaseTime', [125]);
      await ethers.provider.send('evm_mine');
      await this.gov.castVote(2, 1, { from: userAddress1 });
      const prop = await this.gov.proposals(2);
      expect(prop.forVotes).to.be.bignumber.equal(new BN("1"));
    });

    it("Failed Caste Vote", async function () {
      await this.uRvltToken.updateiCultMandator(userAddress1, true, {
        from: ownerAddress,
        gas: 8000000,
      });
      await this.gov.cancel(trivialProposal.id, {
        from: ownerAddress,
        gas: 8000000,
      });
      await this.gov.propose(targets, values, signatures, callDatas, "do nothing", {
        from: ownerAddress,
        gas: 8000000,
      });
      await ethers.provider.send('evm_increaseTime', [450]);
      await ethers.provider.send('evm_mine');
      await expectRevert(
        this.gov.castVote(2, 0, { from: userAddress1 }),
        "GovernorBravo::castVoteInternal: voting is closed"
      );
    });

    it("Failed Caste Vote", async function () {
      await this.gov.cancel(trivialProposal.id, {
        from: ownerAddress,
        gas: 8000000,
      });
      await this.gov.propose(targets, values, signatures, callDatas, "do nothing", {
        from: ownerAddress,
        gas: 8000000,
      });
      await ethers.provider.send('evm_increaseTime', [450]);
      await ethers.provider.send('evm_mine');
      await expectRevert(
        this.gov.castVote(2, 0, { from: userAddress1 }),
        "GovernorBravo::castVoteInternal: Non Cult Manders cannot vote"
      );
    });

    it("Caste Vote(False)", async function () {
      await this.uRvltToken.updateiCultMandator(userAddress1, true, {
        from: ownerAddress,
        gas: 8000000,
      });
      await this.gov.cancel(trivialProposal.id, {
        from: ownerAddress,
        gas: 8000000,
      });
      await this.gov.propose(targets, values, signatures, callDatas, "do nothing", {
        from: ownerAddress,
        gas: 8000000,
      });
      await ethers.provider.send('evm_increaseTime', [125]);
      await ethers.provider.send('evm_mine');
      await this.gov.castVote(2, 0, { from: userAddress1 });
      const prop = await this.gov.proposals(2);
      expect(prop.againstVotes).to.be.bignumber.equal(new BN("1"));
    });

    it("Caste Vote(Try to vote again)", async function () {
      await this.uRvltToken.updateiCultMandator(userAddress1, true, {
        from: ownerAddress,
        gas: 8000000,
      });
      await this.gov.cancel(trivialProposal.id, {
        from: ownerAddress,
        gas: 8000000,
      });
      await this.gov.propose(targets, values, signatures, callDatas, "do nothing", {
        from: ownerAddress,
        gas: 8000000,
      });
      await ethers.provider.send('evm_increaseTime', [125]);
      await ethers.provider.send('evm_mine');
      await this.gov.castVote(2, 0, { from: userAddress1 });
      await expectRevert(
        this.gov.castVote(2, 1, { from: userAddress1 }),
        "GovernorBravo::castVoteInternal: voter already voted"
      );
    });
  });
});
