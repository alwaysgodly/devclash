import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PrototypeBanner } from "@/components/PrototypeBanner";
import "./globals.css";

// Load wagmi/rainbowkit providers client-only. They touch localStorage at
// import time which blows up during SSG — no server rendering needed.
const Providers = dynamic(() => import("./providers").then((m) => m.Providers), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "Onchain Agents — prototype",
  description:
    "Infrastructure for autonomous onchain agents on HeLa testnet. PROTOTYPE ONLY.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <PrototypeBanner />
          <main className="min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
