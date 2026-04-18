// Minimal ABIs — only the fragments the runtime actually calls.

const registryAbi = [
  "function getIntent(bytes32) view returns (tuple(address owner, address vault, address executor, bytes params, bool active, uint256 nonce))",
  "function listByOwner(address) view returns (bytes32[])",
  "event IntentRegistered(bytes32 indexed id, address indexed owner, address executor, address vault, bytes params)",
  "event IntentDeactivated(bytes32 indexed id)",
  "event NonceBumped(bytes32 indexed id, uint256 newNonce)",
];

const iExecutorAbi = [
  "function canExecute(bytes32) view returns (bool, string)",
  "function execute(bytes32, string)",
  "event Executed(bytes32 indexed id, uint256 amountIn, uint256 amountOut, uint256 priceAtExec, string explanation)",
  "event StopLossTriggered(bytes32 indexed id, uint256 priceAtExec, uint256 startPrice, string explanation)",
];

module.exports = { registryAbi, iExecutorAbi };
