// SPDX-License-Identifier: MIT
pragma solidity 0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

contract MockURevolt is ERC20, ERC20Burnable, Ownable, ERC20Permit, ERC20Votes {
    address rvlt;
    mapping(address => bool) public iCultMandator;
    constructor(address _rvlt) ERC20("uRVLT", "uRVLT") ERC20Permit("uRVLT") {
        rvlt = _rvlt;
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    // The following functions are overrides required by Solidity.

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
    }

    function updateCultMandorsReward(uint _price) public {
        IERC20(rvlt).transferFrom(msg.sender, address(this), _price);
    }    

    function updateiCultMandator(address _user, bool _status) external {
        iCultMandator[_user] = _status;
    }
}