import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { helaTestnet, hardhatLocalhost } from "./chains";

// WalletConnect projectId is required by rainbowkit v2. For the prototype a
// placeholder is fine since we default to the browser-injected (MetaMask)
// connector; if we want WalletConnect QR flows we'll swap in a real id.
const projectId =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID || "0000000000000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
  appName: "Onchain Agents (prototype)",
  projectId,
  chains: [hardhatLocalhost, helaTestnet],
  ssr: true,
});
