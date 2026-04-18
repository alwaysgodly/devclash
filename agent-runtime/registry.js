const { ethers } = require("ethers");
const { registryAbi } = require("./abi");

// In-memory store of all intent ids ever registered, rebuilt from chain events
// at startup and incrementally kept up-to-date each cycle.
class IntentIndex {
  constructor(registry, startBlock = 0) {
    this.registry = registry;
    this.ids = new Set();
    this.lastScannedBlock = startBlock - 1;
  }

  async sync(provider) {
    const latest = await provider.getBlockNumber();
    if (latest <= this.lastScannedBlock) return;
    const fromBlock = this.lastScannedBlock + 1;
    const filter = this.registry.filters.IntentRegistered();
    const events = await this.registry.queryFilter(filter, fromBlock, latest);
    for (const e of events) {
      this.ids.add(e.args.id);
    }
    this.lastScannedBlock = latest;
  }
}

async function getActiveIntent(registry, id) {
  const it = await registry.getIntent(id);
  if (!it.active) return null;
  return it;
}

module.exports = { IntentIndex, getActiveIntent };
