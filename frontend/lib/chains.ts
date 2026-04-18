import { defineChain } from "viem";

export const HELA_TESTNET_ID = 666888;

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
