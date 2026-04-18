// Minimal ABIs for the functions the frontend actually calls. Full ABIs live in
// hardhat artifacts and can be regenerated; inlining here keeps the frontend
// build independent of the contracts workspace.

export const vaultFactoryAbi = [
  {
    type: "function",
    name: "createVault",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "vaultOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "VaultCreated",
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "vault", type: "address" },
    ],
  },
] as const;

export const agentVaultAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "approveIntent",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "address" }],
    outputs: [],
  },
  { type: "function", name: "setPaused", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }, { type: "bool" }], outputs: [] },
  { type: "function", name: "revokeIntent", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }], outputs: [] },
  { type: "function", name: "emergencyWithdraw", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] },
  { type: "function", name: "getIntentIds", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32[]" }] },
  {
    type: "function",
    name: "approvals",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "cap", type: "uint256" },
      { name: "spent", type: "uint256" },
      { name: "paused", type: "bool" },
      { name: "executor", type: "address" },
      { name: "active", type: "bool" },
    ],
  },
] as const;

export const intentRegistryAbi = [
  {
    type: "function",
    name: "registerIntent",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "bytes" }],
    outputs: [],
  },
  { type: "function", name: "deactivate", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }], outputs: [] },
  {
    type: "function",
    name: "getIntent",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "vault", type: "address" },
          { name: "executor", type: "address" },
          { name: "params", type: "bytes" },
          { name: "active", type: "bool" },
          { name: "nonce", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "listByOwner",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bytes32[]" }],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export const mockOracleAbi = [
  { type: "function", name: "setPrice", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "getPrice", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
