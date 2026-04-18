// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./AgentVault.sol";

contract VaultFactory {
    mapping(address => address) public vaultOf;

    event VaultCreated(address indexed user, address vault);

    function createVault() external returns (address) {
        require(vaultOf[msg.sender] == address(0), "Factory: vault exists");
        AgentVault v = new AgentVault(msg.sender);
        vaultOf[msg.sender] = address(v);
        emit VaultCreated(msg.sender, address(v));
        return address(v);
    }
}
