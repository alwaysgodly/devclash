"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const links = [
  { href: "/", label: "Home" },
  { href: "/new", label: "New agent" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/faucet", label: "Faucet" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line bg-bg/80 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-5 text-sm">
          <span className="font-semibold tracking-tight">Onchain Agents</span>
          <span className="text-muted">·</span>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                (pathname === l.href ? "text-text" : "text-muted hover:text-text") +
                " transition-colors"
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <ConnectButton showBalance={false} />
      </div>
    </header>
  );
}
