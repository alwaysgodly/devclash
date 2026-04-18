const { ethers } = require("ethers");
const config = require("./config");
const { IntentIndex, getActiveIntent } = require("./registry");
const { decide } = require("./decide");
const { deterministicDecide } = require("./fallback");
const { logEvent } = require("./logger");
const { registryAbi, iExecutorAbi } = require("./abi");
const { startHttpServer } = require("./server");

const TYPE_LABELS = {
  dca: "DCA + stop-loss",
  conditionalTransfer: "Conditional transfer",
  recurringTransfer: "Recurring transfer",
};

function buildExecutorMap(signer) {
  const map = {};
  if (config.dcaExecutorAddr) {
    map[config.dcaExecutorAddr.toLowerCase()] = {
      type: "dca",
      contract: new ethers.Contract(config.dcaExecutorAddr, iExecutorAbi, signer),
    };
  }
  if (config.conditionalTransferExecutorAddr) {
    map[config.conditionalTransferExecutorAddr.toLowerCase()] = {
      type: "conditionalTransfer",
      contract: new ethers.Contract(
        config.conditionalTransferExecutorAddr,
        iExecutorAbi,
        signer
      ),
    };
  }
  if (config.recurringTransferExecutorAddr) {
    map[config.recurringTransferExecutorAddr.toLowerCase()] = {
      type: "recurringTransfer",
      contract: new ethers.Contract(
        config.recurringTransferExecutorAddr,
        iExecutorAbi,
        signer
      ),
    };
  }
  return map;
}

async function processIntent(intentId, registry, executors) {
  const intent = await getActiveIntent(registry, intentId);
  if (!intent) return;

  const executor = executors[intent.executor.toLowerCase()];
  if (!executor) {
    logEvent({
      intentId,
      event: "skip-unknown-executor",
      executor: intent.executor,
    });
    return;
  }

  let canExec, reason;
  try {
    [canExec, reason] = await executor.contract.canExecute(intentId);
  } catch (e) {
    logEvent({
      intentId,
      event: "canExecute-error",
      message: e.message,
    });
    return;
  }
  if (!canExec) return;

  const intentType = executor.type;
  const extras = {
    active: intent.active,
    nonce: intent.nonce.toString(),
    vault: intent.vault,
  };

  let decision;
  try {
    decision = await decide({
      intentType: TYPE_LABELS[intentType] || intentType,
      intentId,
      ownerAddr: intent.owner,
      reason,
      extras,
    });
  } catch (e) {
    decision = deterministicDecide({ intentType, reason });
    decision.llmError = e.message;
  }

  logEvent({
    intentId,
    event: "decision",
    intentType,
    reason,
    decision: {
      action: decision.action,
      explanation: decision.explanation,
      fallback: !!decision.llmFallback,
      llmError: decision.llmError,
    },
  });

  if (decision.action !== "execute") return;

  try {
    const tx = await executor.contract.execute(intentId, decision.explanation);
    const receipt = await tx.wait();
    logEvent({
      intentId,
      event: "executed",
      intentType,
      txHash: receipt.transactionHash,
      block: receipt.blockNumber,
      explanation: decision.explanation,
    });
  } catch (e) {
    logEvent({
      intentId,
      event: "execute-error",
      message: e.message,
    });
  }
}

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    config.rpcUrl,
    config.chainId
  );
  const signer = new ethers.Wallet(config.privateKey, provider);
  const signerAddr = await signer.getAddress();
  const registry = new ethers.Contract(config.registryAddr, registryAbi, signer);

  logEvent({
    event: "runtime-start",
    chainId: config.chainId,
    signer: signerAddr,
    registry: config.registryAddr,
    dca: config.dcaExecutorAddr || null,
    cycleMs: config.cycleMs,
  });

  const executors = buildExecutorMap(signer);
  if (Object.keys(executors).length === 0) {
    logEvent({
      event: "warn",
      message: "no executors configured — runtime will do nothing",
    });
  }

  const index = new IntentIndex(registry);
  await index.sync(provider);

  startHttpServer();

  while (true) {
    try {
      await index.sync(provider);
    } catch (e) {
      logEvent({ event: "sync-error", message: e.message });
    }

    for (const intentId of index.ids) {
      try {
        await processIntent(intentId, registry, executors);
      } catch (e) {
        logEvent({
          intentId,
          event: "cycle-error",
          message: e.message,
        });
      }
    }

    await new Promise((r) => setTimeout(r, config.cycleMs));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
