// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../IExecutor.sol";
import "../IntentRegistry.sol";
import "../AgentVault.sol";

/// @notice Recurring transfer on a time interval. Each execution pulls `amount`
/// of `token` from the user's vault and sends it to `recipient`. Optional
/// `maxExecutions` caps total runs (0 = unlimited, still bounded by vault cap).
contract RecurringTransferExecutor is IExecutor, ReentrancyGuard {
    struct Params {
        address token;
        uint256 amount;
        address recipient;
        uint256 intervalSec;
        uint256 maxExecutions; // 0 means unlimited
    }

    IntentRegistry public immutable registry;

    mapping(bytes32 => uint256) public lastExecAt;
    mapping(bytes32 => uint256) public execCount;

    event Transferred(
        bytes32 indexed id,
        uint256 amount,
        address recipient,
        uint256 count,
        string explanation
    );

    constructor(IntentRegistry registry_) {
        registry = registry_;
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

        Params memory p = _decode(it.params);
        if (p.amount == 0) return (false, "bad params");
        if (p.recipient == address(0)) return (false, "bad params");
        if (p.intervalSec == 0) return (false, "bad params");

        if (p.maxExecutions > 0 && execCount[id] >= p.maxExecutions) {
            return (false, "max executions reached");
        }
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
        require(it.owner != address(0), "Rec: unknown");
        require(it.active, "Rec: inactive");
        require(it.executor == address(this), "Rec: wrong executor");

        Params memory p = _decode(it.params);
        require(p.amount > 0, "Rec: zero amount");
        require(p.recipient != address(0), "Rec: zero recipient");
        require(p.intervalSec > 0, "Rec: zero interval");
        require(
            block.timestamp >= lastExecAt[id] + p.intervalSec,
            "Rec: interval not elapsed"
        );
        if (p.maxExecutions > 0) {
            require(execCount[id] < p.maxExecutions, "Rec: max reached");
        }

        execCount[id] += 1;
        lastExecAt[id] = block.timestamp;

        require(
            AgentVault(it.vault).pullForIntent(id, p.amount, p.recipient),
            "Rec: pull failed"
        );
        registry.bumpNonce(id);

        emit Transferred(id, p.amount, p.recipient, execCount[id], explanation);
    }
}
