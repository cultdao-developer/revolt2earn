// SPDX-License-Identifier: MIT
pragma solidity 0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface uRvltInterface {
    function initializeRandomAddressSelection(
        uint256 _lastFulfilledId,
        uint256[] memory _randomWords,
        address[] memory _nftOwners
    ) external;

    function counter() external pure returns (uint256);
}

contract RandomNumberGenerator is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeMathUpgradeable for uint256;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    CountersUpgradeable.Counter private _requestCounter;

    // uRevolt contract address.
    address public uRevolt;
    // Chainlink's VRF coordinator.
    address public vrfCoordinator;
    // Keyhash used by coordinator.
    bytes32 public keyHash;
    // Callback gas limit for max gas a coordinator can use for fullin request.
    uint32 public callbackGasLimit;
    // Number of confirmation required.
    uint16 public requestConfirmations;
    // Number of random number to generate;
    uint32 public numWords;

    // mapping of random words
    mapping(uint256 => uint256[]) public randomWords;
    // Keep track of requests made to coordinator.
    uint256 public latestRequestID;

    // Keep track of all the request Ids with counter.
    uint256[] public requestIds;

    // last request time of vrf
    uint256 public lastRequestTime;

    // Interval of random number generator
    uint256 public randomNumberInterval;

    // Represent subscription id
    uint64 public subscriptionId;

    // request initiated or not
    bool public isRequestInitialised;

    // last fullfill id of pool
    uint256 public lastFulfilledId;

    // available for initialize
    bool public isAvailableForInitialize;

    // array of nft owners
    address public nftAddress;

    // aray of nft token ids
    uint256[] public tokenIds;

    // array of all nft owners
    address[] public nftOwners;

    // minimum stakers require for random number generation
    uint256 public minimumStakersRequired;

    event RandomNumberGenerationTimeUpdate(uint256 oldRandomNumberInterval, uint256 newRandomNumberInterval);
    event UpdateVrfConfiguration(address vrfCoordinator, bytes32 keyHash, uint32 callbackGasLimit, uint16 requestConfirmations, uint32 numWords, uint64 subscriptionId);

    /**
     * @dev Throws if called by any account other than the uRevolt contract.
     */
    modifier eligibleForEnableInitialize() {
        require(isAvailableForInitialize, "Random: caller is not the uRevolt");
        _;
    }

    /**
     * @dev Throws if request time is not reached.
     */
    modifier eligibleForRequest() {
        require(
            block.timestamp > lastRequestTime.add(randomNumberInterval),
            "Random: caller is not the uRevolt"
        );
        _;
    }

    /**
     * @dev Throws if request time is not reached.
     */
    modifier verifyMinimumHolder() {
        require(
            uRvltInterface(uRevolt).counter() > minimumStakersRequired,
            "Random: Minimum user not reached"
        );
        _;
    }

    /**
     * @notice emitted when random number generation is requested from VRF
     * @param _requestId is the request id returned by VRF
     */
    event RequestRandomNumber(uint256 indexed _requestId);

    /**
     * @notice emitted once request is fulfilled by VRF
     * @param _requestId request id for which it was generated
     * @param _fulfilledIndex index for generated number
     * @param firstNumber generated first random number
     * @param secondNumber generated second random number
     */
    event FulfilledRequest(
        uint256 indexed _requestId,
        uint256 indexed _fulfilledIndex,
        uint256 firstNumber,
        uint256 secondNumber
    );

    /**
     * @param _uRevolt address of uRevolt contract.
     */
    function initialize(address _uRevolt) public initializer {
        require(_uRevolt != address(0), "Invalid _uRevolt address");
        __Ownable_init();
        __ReentrancyGuard_init();
        uRevolt = _uRevolt;
        minimumStakersRequired = 1000;
    }

    /**
     * @notice Update NFT contract's Details
     * @param _nftAddress address of NFT contract
     * @param _tokenIds array of selected tokenIds from the NFT contract
     */
    function updateNftContractDetails(
        address _nftAddress,
        uint256[] memory _tokenIds
    ) external onlyOwner {
        require(_nftAddress != address(0), "Invalid _nftAddress address");
        nftAddress = _nftAddress;
        tokenIds = _tokenIds;
    }

    /**
     * @notice updates minimum stakers required to start random Address selection
     * @param _minimumStakersRequired minimum number of stakers required to initialze Random Address Generation
     */
    function updateMinimumStakersRequired(uint256 _minimumStakersRequired)
        external
        onlyOwner
    {
        minimumStakersRequired = _minimumStakersRequired;
    }

    /**
     * @notice Gets owner of seleceted Token Ids of NFT contract
     */
    function getLatestUsers() external nonReentrant {
        address[] memory _nftOwners;
        nftOwners = _nftOwners;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            nftOwners.push(IERC721Upgradeable(nftAddress).ownerOf(tokenIds[i]));
        }
    }

    /**
     * @notice Updates configuration needed for Chainlink VRF 
     * @param _vrfCoordinator address of chainlink VRF Coordinator contract
     * @param _keyHash VRF coordinator configuration to check for max fees allowed
     * @param _callbackGasLimit max Callback gas limit for requestion random numbers
     * @param _requestConfirmations number of blocks after which random number will be generated
     * @param _numWords Number of random numbers to be generated
     * @param _subscriptionId Subscription ID generated using VRF subscription manager
     */
    function updateVrfConfiguration(
        address _vrfCoordinator,
        bytes32 _keyHash,
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations,
        uint32 _numWords,
        uint64 _subscriptionId
    ) public onlyOwner {
        require(_vrfCoordinator != address(0), "Invalid _vrfCoordinator address");
        vrfCoordinator = _vrfCoordinator;
        keyHash = _keyHash;
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _requestConfirmations;
        numWords = _numWords;
        subscriptionId = _subscriptionId;
        emit UpdateVrfConfiguration(vrfCoordinator, keyHash, callbackGasLimit, requestConfirmations, numWords, subscriptionId);
    }

    /**
     * @notice updates interval to generate random Number
     * @param _randomNumberInterval Time interval for Random number generation
     */
    function updateRandomNumberGenerationTime(uint256 _randomNumberInterval)
        external
        onlyOwner
    {
        emit RandomNumberGenerationTimeUpdate(randomNumberInterval, _randomNumberInterval);
        randomNumberInterval = _randomNumberInterval;
    }

    /**
     * @notice manually Called after random number are generated by VRFCoordinator
     */
    function initializeRandomAddressSelection()
        external
        eligibleForEnableInitialize
        nonReentrant
    {
        uRvltInterface(uRevolt).initializeRandomAddressSelection(
            _requestCounter.current(),
            randomWords[_requestCounter.current()],
            nftOwners
        );
        isAvailableForInitialize = false;
    }

    /**     
     * @notice Used to make request to VRFCoordinator contract for Random number generation
    */
    function requestRandomWords()
        external
        nonReentrant
        eligibleForRequest
        verifyMinimumHolder
    {
        latestRequestID = VRFCoordinatorV2Interface(vrfCoordinator)
            .requestRandomWords(
                keyHash,
                subscriptionId,
                requestConfirmations,
                callbackGasLimit,
                numWords
            );
        emit RequestRandomNumber(latestRequestID);
    }


    /** 
     * @notice used by rawFulfillRandomWords to update random numbers generated
    */
    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) internal verifyMinimumHolder {
        if (block.timestamp > lastRequestTime.add(randomNumberInterval)) {
            _requestCounter.increment();
            randomWords[_requestCounter.current()] = _randomWords;
            isRequestInitialised = false;
            lastFulfilledId = _requestId;
            requestIds.push(_requestId);
            lastRequestTime = block.timestamp;
            isAvailableForInitialize = true;
            emit FulfilledRequest(
                _requestId,
                _requestCounter.current(),
                _randomWords[0],
                _randomWords[1]
            );
        }
    }

    /**
     * @notice called by VRF coordinator to fulfill random words request
     */
    function rawFulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) external nonReentrant {
        require(
            msg.sender == vrfCoordinator,
            "VRFv2ConsumerBase:Only Coordinator Can Fulfill"
        );
        fulfillRandomWords(_requestId, _randomWords);
    }

    /**
     * @notice returns latest random number generation Request counter
     */
    function viewLatestRequestBatchId() external view returns (uint256) {
        return _requestCounter.current();
    }

    /**
     * @notice Function override from UUPS
     */
    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
//
