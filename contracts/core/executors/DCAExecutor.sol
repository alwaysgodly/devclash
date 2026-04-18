// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../IExecutor.sol";
import "../IntentRegistry.sol";
import "../AgentVault.sol";
import "../../mocks/MockOracle.sol";
import "../../mocks/MockDEX.sol";

/// @notice Dollar-cost-averaging executor with stop-loss.
/// Pulls `amountPerExec` of tokenIn from the user's vault every `intervalSec`
/// and swaps it into tokenOut at the oracle price. If a `stopLossBps` is set and
/// the oracle price of tokenOut drops by >= stopLossBps from the price recorded
/// on first execution, future executions are refused and the intent marked stopped.
contract DCAExecutor is IExecutor, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct DCAParams {
        address tokenIn;
        address tokenOut;
        uint256 amountPerExec;
        uint256 intervalSec;
        uint256 stopLossBps; // 0 disables stop-loss
    }

    IntentRegistry public immutable registry;
    MockOracle public immutable oracle;
    MockDEX public immutable dex;

    mapping(bytes32 => uint256) public lastExecAt;
    mapping(bytes32 => uint256) public startPriceOf;
    mapping(bytes32 => bool) public stopped;

    event Executed(
        bytes32 indexed id,
        uint256 amountIn,
        uint256 amountOut,
        uint256 priceAtExec,
        string explanation
    );
    event StopLossTriggered(
        bytes32 indexed id,
        uint256 priceAtExec,
        uint256 startPrice,
        string explanation
    );

    constructor(IntentRegistry registry_, MockOracle oracle_, MockDEX dex_) {
        registry = registry_;
        oracle = oracle_;
        dex = dex_;
    }

    function _decode(bytes memory params) internal pure returns (DCAParams memory) {
        return abi.decode(params, (DCAParams));
    }

    function canExecute(bytes32 id)
        external
        view
        override
        returns (bool ok, string memory reason)
    {
        IntentRegistry.Intent memory it = registry.getIntent(id);
        if (it.owner == address(0)) return (false, "unknown");
        if (!it.active) return (false, "inactive");
        if (it.executor != address(this)) return (false, "wrong executor");
        if (stopped[id]) return (false, "stopped");

        DCAParams memory p = _decode(it.params);
        if (p.amountPerExec == 0 || p.intervalSec == 0) return (false, "bad params");
        if (p.tokenIn == p.tokenOut) return (false, "same token");

        if (block.timestamp < lastExecAt[id] + p.intervalSec) {
            return (false, "interval not elapsed");
        }
        return (true, "ready");
    }

    function execute(bytes32 id, string calldata explanation)
        external
        override
        nonReentrant
    {
        IntentRegistry.Intent memory it = registry.getIntent(id);
        require(it.owner != address(0), "DCA: unknown");
        require(it.active, "DCA: inactive");
        require(it.executor == address(this), "DCA: wrong executor");
        require(!stopped[id], "DCA: stopped");

        DCAParams memory p = _decode(it.params);
        require(p.amountPerExec > 0 && p.intervalSec > 0, "DCA: bad params");
        require(p.tokenIn != p.tokenOut, "DCA: same token");
        require(
            block.timestamp >= lastExecAt[id] + p.intervalSec,
            "DCA: interval not elapsed"
        );

        uint256 price = oracle.getPrice(p.tokenOut);

        uint256 startPrice = startPriceOf[id];
        if (startPrice == 0) {
            startPriceOf[id] = price;
            startPrice = price;
        }

        // Stop-loss check
        if (p.stopLossBps > 0) {
            uint256 trigger = (startPrice * (10_000 - p.stopLossBps)) / 10_000;
            if (price <= trigger) {
                stopped[id] = true;
                lastExecAt[id] = block.timestamp;
                registry.bumpNonce(id);
                emit StopLossTriggered(id, price, startPrice, explanation);
                return;
            }
        }

        // Normal DCA swap path
        require(
            AgentVault(it.vault).pullForIntent(id, p.amountPerExec, address(this)),
            "DCA: pull failed"
        );
        IERC20(p.tokenIn).safeIncreaseAllowance(address(dex), p.amountPerExec);
        uint256 amountOut =
            dex.swap(p.tokenIn, p.tokenOut, p.amountPerExec, it.vault);

        lastExecAt[id] = block.timestamp;
        registry.bumpNonce(id);

        emit Executed(id, p.amountPerExec, amountOut, price, explanation);
    }
}
