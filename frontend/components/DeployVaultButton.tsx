"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { addresses, isAddressSet } from "@/lib/addresses";
import { vaultFactoryAbi } from "@/lib/abi";

export function DeployVaultButton() {
  const { address } = useAccount();
  const factory = addresses.vaultFactory;

  const { data: vaultAddr, refetch } = useReadContract({
    address: factory,
    abi: vaultFactoryAbi,
    functionName: "vaultOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isAddressSet(factory) },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  if (isSuccess) refetch();

  if (!isAddressSet(factory)) {
    return (
      <div className="rounded-md border border-line bg-panel p-4 text-sm text-muted">
        VaultFactory not deployed yet. Run <code className="font-mono">npm run deploy:core</code> and
        set <code className="font-mono">NEXT_PUBLIC_VAULT_FACTORY_ADDR</code>.
      </div>
    );
  }

  const hasVault =
    typeof vaultAddr === "string" &&
    vaultAddr !== "0x0000000000000000000000000000000000000000";

  if (hasVault) {
    return (
      <div className="rounded-md border border-ok/40 bg-ok/10 p-4 text-sm">
        <div className="text-ok font-semibold">Vault deployed</div>
        <div className="font-mono break-all text-text/80 mt-1">{vaultAddr as string}</div>
      </div>
    );
  }

  const busy = isPending || isMining;

  return (
    <button
      onClick={() =>
        writeContract({
          address: factory,
          abi: vaultFactoryAbi,
          functionName: "createVault",
        })
      }
      disabled={busy || !address}
      className="rounded-md bg-accent px-5 py-3 font-semibold text-white hover:bg-accent/90"
    >
      {busy ? "Deploying…" : "Deploy my agent vault"}
    </button>
  );
}
