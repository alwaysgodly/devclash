// SPDX-License-Identifier: MIT
// PROTOTYPE ONLY — deterministic swap at oracle price, zero fees, infinite
// liquidity (mints the output token on demand). Only valid because output tokens
// are MockERC20 with public mint; this pattern must not be used in production.
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./MockERC20.sol";
import "./MockOracle.sol";

contract MockDEX {
    using SafeERC20 for IERC20;

    MockOracle public immutable oracle;

    event Swapped(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address to
    );

    constructor(MockOracle oracle_) {
        oracle = oracle_;
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address to
    ) external returns (uint256 amountOut) {
        require(tokenIn != tokenOut, "MockDEX: same token");
        require(amountIn > 0, "MockDEX: zero amount");
        require(to != address(0), "MockDEX: zero recipient");

        uint256 priceIn = oracle.getPrice(tokenIn);
        uint256 priceOut = oracle.getPrice(tokenOut);

        amountOut = (amountIn * priceIn) / priceOut;
        require(amountOut > 0, "MockDEX: zero output");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        MockERC20(tokenOut).mint(to, amountOut);

        emit Swapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut, to);
    }
}
