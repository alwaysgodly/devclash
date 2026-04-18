// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../IExecutor.sol";
import "../IntentRegistry.sol";
import "../AgentVault.sol";
import "../../mocks/MockOracle.sol";

/// @notice One-shot transfer from the user's vault to a recipient when the
/// mock oracle price of a watched token crosses a threshold in a specified
/// direction. Once triggered, the intent cannot re-execute.
contract ConditionalTransferExecutor is IExecutor, ReentrancyGuard {
    struct Params {
        address token;          // token to transfer out of vault
        uint256 amount;         // amount to transfer
        address recipient;      // destination
        address priceToken;     // token whose oracle price drives the condition
        uint256 priceThreshold; // 18-decimal USD price
        uint8 direction;        // 0 = price >= threshold triggers, 1 = price <= threshold triggers
    }

    IntentRegistry public immutable registry;
    MockOracle public immutable oracle;

    mapping(bytes32 => bool) public executedOf;

    event Triggered(
        bytes32 indexed id,
        uint256 priceAtExec,
        uint256 amount,
        address recipient,
        string explanation
    );

    constructor(IntentRegistry registry_, MockOracle oracle_) {
        registry = registry_;
        oracle = oracle_;
    }

    function _decode(bytes memory params) internal pure returns (Params memory) {
        return abi.decode(params, (Params));
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
        if (executedOf[id]) return (false, "already executed");

        Params memory p = _decode(it.params);
        if (p.amount == 0) return (false, "bad params");
        if (p.recipient == address(0)) return (false, "bad params");
        if (p.direction > 1) return (false, "bad params");
        if (p.priceThreshold == 0) return (false, "bad params");

        uint256 price = oracle.getPrice(p.priceToken);
        if (p.direction == 0) {
            if (price < p.priceThreshold) return (false, "price below threshold");
        } else {
            if (price > p.priceThreshold) return (false, "price above threshold");
        }
        return (true, "condition met");
    }

    function execute(bytes32 id, string calldata explanation)
        external
        override
        nonReentrant
    {
        IntentRegistry.Intent memory it = registry.getIntent(id);
        require(it.owner != address(0), "Cond: unknown");
        require(it.active, "Cond: inactive");
        require(it.executor == address(this), "Cond: wrong executor");
        require(!executedOf[id], "Cond: already executed");

        Params memory p = _decode(it.params);
        require(p.amount > 0, "Cond: zero amount");
        require(p.recipient != address(0), "Cond: zero recipient");
        require(p.direction <= 1, "Cond: bad direction");
        require(p.priceThreshold > 0, "Cond: zero threshold");

        uint256 price = oracle.getPrice(p.priceToken);
        if (p.direction == 0) {
            require(price >= p.priceThreshold, "Cond: below threshold");
        } else {
            require(price <= p.priceThreshold, "Cond: above threshold");
        }

        executedOf[id] = true;

        require(
            AgentVault(it.vault).pullForIntent(id, p.amount, p.recipient),
            "Cond: pull failed"
        );
        registry.bumpNonce(id);

        emit Triggered(id, price, p.amount, p.recipient, explanation);
    }
}
