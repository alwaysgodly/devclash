// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IExecutor {
    function canExecute(bytes32 id) external view returns (bool ok, string memory reason);
    function execute(bytes32 id, string calldata explanation) external;
}
