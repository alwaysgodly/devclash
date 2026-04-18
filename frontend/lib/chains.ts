import { defineChain } from "viem";

export const HELA_TESTNET_ID = 666888;
export const LOCALHOST_ID = 31337;

export const helaTestnet = defineChain({
  id: HELA_TESTNET_ID,
  name: "HeLa Testnet",
  nativeCurrency: { name: "Testnet HLUSD", symbol: "tHLUSD", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.helachain.com"] },
  },
  blockExplorers: {
    default: { name: "HeLa Explorer", url: "https://testnet-blockexplorer.helachain.com" },
  },
  testnet: true,
});

export const hardhatLocalhost = defineChain({
  id: LOCALHOST_ID,
  name: "Hardhat Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
  testnet: true,
});

export const ALLOWED_CHAIN_IDS = [HELA_TESTNET_ID, LOCALHOST_ID] as const;
