// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Non-custodial per-user "guarded box". Holds the user's token balance.
/// The user authorizes intents with finite caps bound to a specific executor; the
/// executor may pull funds up to the cap. The user retains ultimate control via
/// pause/revoke/emergencyWithdraw — all Ownable.
contract AgentVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct IntentApproval {
        address token;
        uint256 cap;
        uint256 spent;
        bool paused;
        address executor;
        bool active;
    }

    mapping(bytes32 => IntentApproval) public approvals;
    bytes32[] public allIntentIds;

    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount);
    event IntentApproved(
        bytes32 indexed id,
        address token,
        uint256 cap,
        address executor
    );
    event IntentPauseChanged(bytes32 indexed id, bool paused);
    event IntentRevoked(bytes32 indexed id);
    event Pulled(bytes32 indexed id, address token, uint256 amount, address to);
    event EmergencyWithdrawn(address indexed token, uint256 amount);

    constructor(address owner_) {
        require(owner_ != address(0), "Vault: zero owner");
        _transferOwnership(owner_);
    }

    function deposit(address token, uint256 amount) external onlyOwner {
        require(amount > 0, "Vault: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(token, amount);
    }

    function withdraw(address token, uint256 amount) external onlyOwner {
        require(amount > 0, "Vault: zero amount");
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(token, amount);
    }

    function approveIntent(
        bytes32 id,
        address token,
        uint256 cap,
        address executor
    ) external onlyOwner {
        require(token != address(0) && executor != address(0), "Vault: zero addr");
        require(cap > 0, "Vault: zero cap");
        require(!approvals[id].active, "Vault: duplicate");
        approvals[id] = IntentApproval({
            token: token,
            cap: cap,
            spent: 0,
            paused: false,
            executor: executor,
            active: true
        });
        allIntentIds.push(id);
        emit IntentApproved(id, token, cap, executor);
    }

    function setPaused(bytes32 id, bool paused_) external onlyOwner {
        require(approvals[id].active, "Vault: unknown");
        approvals[id].paused = paused_;
        emit IntentPauseChanged(id, paused_);
    }

    function revokeIntent(bytes32 id) external onlyOwner {
        require(approvals[id].active, "Vault: unknown");
        approvals[id].active = false;
        emit IntentRevoked(id);
    }

    /// @notice Called by an intent's registered executor to pull funds. Enforces
    /// caller, cap, pause, and active flags. CEI pattern + nonReentrant.
    function pullForIntent(
        bytes32 id,
        uint256 amount,
        address to
    ) external nonReentrant returns (bool) {
        IntentApproval storage a = approvals[id];
        require(a.active, "Vault: inactive");
        require(!a.paused, "Vault: paused");
        require(msg.sender == a.executor, "Vault: wrong executor");
        require(amount > 0, "Vault: zero amount");
        require(to != address(0), "Vault: zero recipient");
        require(a.spent + amount <= a.cap, "Vault: cap exceeded");

        a.spent += amount;
        IERC20(a.token).safeTransfer(to, amount);
        emit Pulled(id, a.token, amount, to);
        return true;
    }

    /// @notice Unconditional withdrawal of a token balance to the owner. Does NOT
    /// touch approvals; intents stay recorded for audit but will fail on pull due
    /// to empty balance. Owner should also call revokeIntent for affected intents.
    function emergencyWithdraw(address token) external onlyOwner nonReentrant {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) {
            emit EmergencyWithdrawn(token, 0);
            return;
        }
        IERC20(token).safeTransfer(owner(), bal);
        emit EmergencyWithdrawn(token, bal);
    }

    function getIntentIds() external view returns (bytes32[] memory) {
        return allIntentIds;
    }
}
