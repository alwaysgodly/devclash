// SPDX-License-Identifier: MIT
// PROTOTYPE ONLY — owner-settable price feed, no real oracle. 18-decimal prices
// (USD per token). 0 means unset.
pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockOracle is Ownable {
    mapping(address => uint256) private _price;

    event PriceSet(address indexed token, uint256 price);

    function setPrice(address token, uint256 price) external onlyOwner {
        _price[token] = price;
        emit PriceSet(token, price);
    }

    function getPrice(address token) external view returns (uint256) {
        uint256 p = _price[token];
        require(p > 0, "MockOracle: price unset");
        return p;
    }
}
