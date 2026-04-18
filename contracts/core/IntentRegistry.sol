// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

contract IntentRegistry {
    struct Intent {
        address owner;
        address vault;
        address executor;
        bytes params;
        bool active;
        uint256 nonce;
    }

    mapping(bytes32 => Intent) public intents;
    mapping(address => bytes32[]) private _ownerIntents;

    event IntentRegistered(
        bytes32 indexed id,
        address indexed owner,
        address executor,
        address vault,
        bytes params
    );
    event IntentDeactivated(bytes32 indexed id);
    event NonceBumped(bytes32 indexed id, uint256 newNonce);

    function registerIntent(
        bytes32 id,
        address vault,
        address executor,
        bytes calldata params
    ) external {
        require(intents[id].owner == address(0), "Registry: exists");
        require(vault != address(0) && executor != address(0), "Registry: zero addr");
        require(params.length > 0, "Registry: empty params");
        intents[id] = Intent({
            owner: msg.sender,
            vault: vault,
            executor: executor,
            params: params,
            active: true,
            nonce: 0
        });
        _ownerIntents[msg.sender].push(id);
        emit IntentRegistered(id, msg.sender, executor, vault, params);
    }

    function deactivate(bytes32 id) external {
        Intent storage it = intents[id];
        require(it.owner == msg.sender, "Registry: not owner");
        require(it.active, "Registry: already inactive");
        it.active = false;
        emit IntentDeactivated(id);
    }

    function bumpNonce(bytes32 id) external {
        Intent storage it = intents[id];
        require(it.owner != address(0), "Registry: unknown");
        require(msg.sender == it.executor, "Registry: not executor");
        it.nonce += 1;
        emit NonceBumped(id, it.nonce);
    }

    function getIntent(bytes32 id) external view returns (Intent memory) {
        return intents[id];
    }

    function listByOwner(address owner) external view returns (bytes32[] memory) {
        return _ownerIntents[owner];
    }
}
