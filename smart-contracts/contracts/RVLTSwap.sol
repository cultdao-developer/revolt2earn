// SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {MerkleProofUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";

contract RVLTSwap is
    Initializable,
    PausableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    // Info of each user RVLT.
    struct UserInfoRVLT {
        uint256 amount; // user RVLT amount.
        bool isClaimed; // claim status.
    }

    // Info of each user uRVLT.
    struct UserInfouRVLT {
        uint256 amount; // user uRVLT amount.
        bool isClaimed; // claim status.
    }

    // user claim status rvlt
    mapping(address => bool) public isUserClaimedRVLT;
    // user claim status uRVLT
    mapping(address => bool) public isUserClaimeduRVLT;
    // info of blacklist user
    mapping(address => bool) public blacklistUsers;
    // Info of each user.
    mapping(address => UserInfoRVLT) public userInfoRVLT;
    // Info of each user.
    mapping(address => UserInfouRVLT) public userInfouRVLT;
    // merket root RVLT
    bytes32 public merkleRVLTRoot;
    // merket root uRVLT
    bytes32 public merkleuRVLTRoot;
    // current total claimed
    uint256 public totalRVLTClaimed;
    // current total claimed
    uint256 public totaluRVLTClaimed;

    // The oldRVLT TOKEN!
    IERC20Upgradeable public oldRVLT;
    // The newRVLT TOKEN!
    IERC20Upgradeable public newRVLT;
    // The uRVLT TOKEN!
    IERC20Upgradeable public uRVLT;
    // status of swap uRVLT
    bool public swapuRVLTAllow;

    event setBlacklistUserEvent(address _user, bool _status);
    event setMerkleRootRVLTEvent(bytes32 _newRoot);
    event setMerkleRootuRVLTEvent(bytes32 _newRoot);
    event claimRVLTEvent(address _user, uint256 _amount);
    event claimuRVLTEvent(address _user, uint256 _amount);
    event updateTokenAddressEvent(address _oldRVLT, address _newRVLT, address _uRVLT);
    event setSwapuRVLTStatusEvent(bool _status);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IERC20Upgradeable _oldRVLT,
        IERC20Upgradeable _newRVLT,
        IERC20Upgradeable _uRVLT
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        oldRVLT = _oldRVLT;
        newRVLT = _newRVLT;
        uRVLT = _uRVLT;
    }

    /**
     * @notice claim oldRVLT to newRVLT by merkle root.
     *
     * @param _amount. RVLT amount.
     * @param _proof. The Merkle Proof of the user.
     */
    function claimRVLT(uint256 _amount, bytes32[] calldata _proof) public {
        require(blacklistUsers[msg.sender] != true, "Not allowed to claim");
        require(_amount > 0, "HAVE TO claim AT LEAST 1");
        require(isUserClaimedRVLT[msg.sender] != true, "Already claimed");
        require(merkleRVLTRoot != "", "Merkle Root Not Set");

        UserInfoRVLT storage user = userInfoRVLT[msg.sender];

        validateUser(_amount, _proof, merkleRVLTRoot);

        user.amount = (user.amount).add(_amount);
        user.isClaimed = true;
        totalRVLTClaimed = totalRVLTClaimed.add(_amount);
        isUserClaimedRVLT[msg.sender] = true;

        IERC20Upgradeable(oldRVLT).transferFrom(msg.sender, address(this), _amount);
        IERC20Upgradeable(newRVLT).transfer(msg.sender, _amount);

        emit claimRVLTEvent(msg.sender, _amount);
    }

    /**
     * @notice claim uRVLT to RVLT by merkle root.
     *
     * @param _amount. uRVLT amount.
     * @param _proof. The Merkle Proof of the user.
     */
    function claimuRVLT(uint256 _amount, bytes32[] calldata _proof) public {
        require(blacklistUsers[msg.sender] != true, "Not allowed to claim");
        require(_amount > 0, "HAVE TO claim AT LEAST 1");
        require(isUserClaimeduRVLT[msg.sender] != true, "Already claimed");
        require(merkleuRVLTRoot != "", "Merkle Root Not Set");

        UserInfouRVLT storage user = userInfouRVLT[msg.sender];

        validateUser(_amount, _proof, merkleuRVLTRoot);

        user.amount = (user.amount).add(_amount);
        user.isClaimed = true;
        totaluRVLTClaimed = totaluRVLTClaimed.add(_amount);
        isUserClaimeduRVLT[msg.sender] = true;

        IERC20Upgradeable(uRVLT).transferFrom(msg.sender, address(this), _amount);
        IERC20Upgradeable(newRVLT).transfer(msg.sender, _amount);

        emit claimuRVLTEvent(msg.sender, _amount);
    }

    /**
     * @notice swap uRVLT to RVLT.
     *
     * @param _amount. uRVLT amount.
     */
    function swapuRVLT(uint256 _amount) public {
        require(blacklistUsers[msg.sender] != true, "Not allowed to claim");
        require(_amount > 0, "HAVE TO claim AT LEAST 1");
        require(swapuRVLTAllow == true, "Not Allow");

        UserInfouRVLT storage user = userInfouRVLT[msg.sender];

        user.amount = (user.amount).add(_amount);
        user.isClaimed = true;
        totaluRVLTClaimed = totaluRVLTClaimed.add(_amount);

        IERC20Upgradeable(uRVLT).transferFrom(msg.sender, address(this), _amount);
        IERC20Upgradeable(newRVLT).transfer(msg.sender, _amount);

        emit claimuRVLTEvent(msg.sender, _amount);
    }

    function validateUser(
        uint256 _amount,
        bytes32[] calldata proof,
        bytes32 _merkleRoot
    ) internal view {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, _amount));
        
        require(MerkleProofUpgradeable.verify(proof, _merkleRoot, leaf) == true, "Not Whitelisted");
    }

    /**
     * @notice Allows owner to withdraw funds.
     */
    function withdraw(address _token, uint256 _amount, address _to) external onlyOwner {
        uint256 contractBalance = IERC20Upgradeable(_token).balanceOf(address(this));
        require(contractBalance >= _amount, "NO ABLE WITHDRAW");

        IERC20Upgradeable(_token).transfer(_to, _amount);
    }

    /**
     * @notice black list any user.
     *
     * @param _user. The user address.
     * @param _status. true for blacklist.
     */
    function updateBlacklistUser(address _user, bool _status) external onlyOwner {
        require(_user != address(0), "Invalid address");
        blacklistUsers[_user] = _status;
        emit setBlacklistUserEvent(_user, _status);
    }

    /**
     * @notice Change the phase one merkle root.
     *
     * @param _newRoot. The new merkleRoot.
     */
    function setMerkleRootRVLT(bytes32 _newRoot) external onlyOwner {
        merkleRVLTRoot = _newRoot;
        emit setMerkleRootRVLTEvent(_newRoot);
    }

    /**
     * @notice Change the phase one merkle root.
     *
     * @param _newRoot. The new merkleRoot.
     */
    function setMerkleRootuRVLT(bytes32 _newRoot) external onlyOwner {
        merkleuRVLTRoot = _newRoot;
        emit setMerkleRootuRVLTEvent(_newRoot);
    }

    /**
     * @notice update Token Address.
     *
     * @param _oldRVLT. The oldRVLT address.
     * @param _newRVLT. The newRVLT address.
     * @param _uRVLT. The uRVLT address.
     */
    function updateTokenAddress(address _oldRVLT, address _newRVLT, address _uRVLT) external onlyOwner {
        if(_oldRVLT != address(0)) {
            oldRVLT = IERC20Upgradeable(_oldRVLT);
        } else if(_newRVLT != address(0)) {
            newRVLT = IERC20Upgradeable(_newRVLT);
        } else if(_uRVLT != address(0)) {
            uRVLT = IERC20Upgradeable(_uRVLT);
        }

        emit updateTokenAddressEvent(_oldRVLT, _newRVLT, _uRVLT);
    }

    /**
     * @notice allow swap uRVLT.
     *
     * @param _status. swap uRVLT status.
     */
    function setSwapuRVLTStatus(bool _status) external onlyOwner {
        swapuRVLTAllow = _status;
        emit setSwapuRVLTStatusEvent(_status);
    }
    
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
