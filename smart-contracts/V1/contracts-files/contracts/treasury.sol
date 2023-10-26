// SPDX-License-Identifier: MIT
pragma solidity 0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

interface IUniswapV2Router {
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function getPair(address tokenA, address tokenB)
        external
        view
        returns (address pair);

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;

    function WETH() external pure returns (address);

    function factory() external pure returns (address);
}

contract InversteeDetailsStruct {
    struct InversteeDetails {
        address _investee;
        uint _fundAmount;
    }
}

interface IGovernance {
    function _fundInvestee() external returns(InversteeDetailsStruct.InversteeDetails memory);
    function nextInvesteeFund() external pure returns(uint256);
    function nextInvestee() external pure returns(uint256);
    function investeeDetails(uint256 _investeeId) external returns(InversteeDetailsStruct.InversteeDetails memory);
}

interface IURevolt {
    function updateCultMandatorsReward(uint256 _reward) external;
}

contract Treasury is
    Initializable,
    UUPSUpgradeable,
    PausableUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeMathUpgradeable for uint256;
    // Dead address to burn tokens
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    // address of rvlt token
    address public rvlt;
    // address of DAO contract
    address public dao;
    // address of uRVLT token
    address public uRvlt;
    // address of multisign wallet address
    address public multSignWallet;
    // address of exchange router
    address public router;
    // array path of weth and rvlt
    address[] private path;
    // array path of rvlt, weth, and usdc 
    address[] private pathUSDC;
    // address of usdc token
    address public USDC;

    /**
      * @notice initialize params
      * @param _rvlt address of rvlt token
      * @param _router address of router contract
      * @param _usdc address of rvlt token
      * @param _weth address of rvlt token
      */
    function initialize(        
        address _rvlt,
        address _router,
        address _usdc,
        address _weth
        ) public initializer {
        require(_rvlt != address(0),"initialize: Invalid address");
        require(_usdc != address(0),"initialize: Invalid address");
        require(_router != address(0),"initialize: Invalid address");
        require(_weth != address(0), "initialize: Invalid address");
        rvlt = _rvlt;
        router = _router;
        OwnableUpgradeable.__Ownable_init();
        ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
        __Context_init_unchained();
        __Pausable_init_unchained();
        path.push(_weth);
        path.push(rvlt);
        USDC = _usdc;
        pathUSDC.push(rvlt);
        pathUSDC.push(_weth);
        pathUSDC.push(USDC);
    }

    function _authorizeUpgrade(address) internal view override {
        require(owner() == msg.sender, "Only owner can upgrade implementation");
    }

    /**
      * @notice Set DAO address
      * @param _dao The address of DAO 
      */
    function setDAOAddress(address _dao) external onlyOwner {
        require(_dao != address(0),"setDAOAddress: Invalid address");
        dao = _dao;
    }

    /**
      * @notice Set uRVLT address
      * @param _urvlt The address of uRVLT 
      */
    function setuRVLTAddress(address _urvlt) external onlyOwner {
        require(_urvlt != address(0),"setDAOAddress: Invalid address");
        uRvlt = _urvlt;
    }

    /**
      * @notice Set multiSign address
      * @param _multiSignAddress The address of multiSign 
      */
    function setMultiSignAddress(address _multiSignAddress) external onlyOwner {
        require(_multiSignAddress != address(0),"setMultiSignAddress: Invalid address");
        multSignWallet = _multiSignAddress;
    }

    /**
      * @notice return rvlt price in usdc
      * @param _amount The amount of uRvlt 
      */
    function revoltPriceInUSD(uint256 _amount) public view returns (uint256) {
        uint256[] memory revoltAmount = IUniswapV2Router(router).getAmountsOut(_amount, pathUSDC);
        return revoltAmount[2];
    }

    /**
      * @notice validatePayout used to distribute fund
      */
    function validatePayout() external {
        uint256 balance = IERC20Upgradeable(rvlt).balanceOf(address(this));
        InversteeDetailsStruct.InversteeDetails memory investee = IGovernance(dao).investeeDetails(IGovernance(dao).nextInvesteeFund());
        if(investee._investee != address(0) && investee._fundAmount == 0) {
            InversteeDetailsStruct.InversteeDetails memory investee = IGovernance(dao)._fundInvestee();
        }
        if(balance > 0 && investee._fundAmount != 0) {
            uint256[] memory getRvltAmountOneETH = IUniswapV2Router(router).getAmountsOut(investee._fundAmount, path);
            if((IGovernance(dao).nextInvesteeFund()<IGovernance(dao).nextInvestee()) && balance >= getRvltAmountOneETH[1]){
                fundInvestee(getRvltAmountOneETH[1]);
            }
        }
    }

    function fundInvestee(uint256 totalAmount) internal nonReentrant{
        InversteeDetailsStruct.InversteeDetails memory investee = IGovernance(dao)._fundInvestee();
        IERC20Upgradeable(rvlt).transfer(DEAD_ADDRESS, totalAmount.mul(25).div(100));
        IERC20Upgradeable(rvlt).transfer(investee._investee, totalAmount.mul(40).div(100));
        IERC20Upgradeable(rvlt).transfer(uRvlt, totalAmount.mul(25).div(100));
        IERC20Upgradeable(rvlt).transfer(multSignWallet, totalAmount.mul(5).div(100));
        IERC20Upgradeable(rvlt).approve(uRvlt, totalAmount.mul(5).div(100));
        IURevolt(uRvlt).updateCultMandatorsReward(totalAmount.mul(5).div(100));
    }
}

