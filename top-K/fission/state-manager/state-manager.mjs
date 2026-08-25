import * as Y from "yjs-ypcounter";
import { WebsocketProvider } from "y-websocket-pncounter";
import WebSocketPolyfill from "ws";

// Persistent state for the process lifetime
const ydoc = new Y.Doc();

const provider = new WebsocketProvider(
  "ws://provider-service.default.svc.cluster.local:1234",
  //"ws://host.minikube.internal:1234",
  "state-manager", // room name / key - keep consistent across pods
  ydoc,
  { WebSocketPolyfill }
);

const yFrequencyMap = ydoc.getMap('frequencyMap');
let totalChars = 0;
const clientId = ydoc.clientID;
const managerId = `mgr-${Math.random().toString(36).substr(2, 9)}`;
console.log(`[State Manager] Instance started: ${managerId}`);

// Promise that resolves when initial sync is complete
let syncResolve;
const syncPromise = new Promise((resolve) => {
  syncResolve = resolve;
  if (provider.synced) {
    console.log("[y-websocket] Already synced on init");
    resolve();
  }
});

provider.on("status", (e) => {
  console.log("[y-websocket] status:", e.status); // "connecting" | "connected" | "disconnected"
});

provider.on("synced", (isSynced) => {
  console.log("[y-websocket] synced:", isSynced);
  if (isSynced && syncResolve) {
    syncResolve();
  }
});

// Observe changes to the frequencyMap (fires for both local and remote updates,
// which is what keeps every state-manager pod automatically up to date)
yFrequencyMap.observe((event, transaction) => {
  const isRemote = transaction.origin === provider;
  console.log(`[yFrequencyMap] Change detected - origin: ${isRemote ? "remote" : "local"}`);

  event.changes.keys.forEach((change, key) => {
    if (change.action === 'add') {
      const counter = yFrequencyMap.get(key);
      console.log(`  [ADD] key="${key}" value=${counter?.value ?? 'N/A'}`);
    } else if (change.action === 'update') {
      const counter = yFrequencyMap.get(key);
      console.log(`  [UPDATE] key="${key}" newValue=${counter?.value ?? 'N/A'}`);
    } else if (change.action === 'delete') {
      console.log(`  [DELETE] key="${key}"`);
    }
  });

  console.log(`  Total unique keys: ${yFrequencyMap.size}, Total chars: ${totalChars}`);
});

function YdocTransaction(newCounts, nodeId) {
  ydoc.transact(() => {
    Object.entries(newCounts).forEach(([char, count]) => {
      let counterKey = `${char}:${nodeId}`;
      if (!yFrequencyMap.has(counterKey)) {
        const counter = new Y.PNCounter();
        yFrequencyMap.set(counterKey, counter);
      }
      const counter = yFrequencyMap.get(counterKey);
      counter.increment(count);
      totalChars += count;
    });
  });
}

export default async function(context) {
  const body = context.request.body;
  const operation = body.operation;

  // Wait for initial sync before processing to avoid creating duplicate counters
  const syncWaitStart = performance.now();
  try {
    await Promise.race([
      syncPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 5000))
    ]);
  } catch (e) {
    console.log("[State Manager] Sync wait failed:", e.message, "- proceeding anyway");
  }
  const syncWaitMs = Number((performance.now() - syncWaitStart).toFixed(2));

  switch (operation) {
    case 'reset': {
      if (!provider.synced) {
        try {
          await Promise.race([
            syncPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('sync timeout')), 65000))
          ]);
        } catch (e) {
          return {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
            body: { error: 'Not synced, cannot guarantee reset', managerId }
          };
        }
      }
    
      const keysToDelete = Array.from(yFrequencyMap.keys());   // snapshot first
      ydoc.transact(() => {
        keysToDelete.forEach((key) => yFrequencyMap.delete(key));
      });
      totalChars = 0;
    
      await new Promise((resolve) => setTimeout(resolve, 200));
    
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'State reset', managerId, synced: provider.synced }
      };
    }   
    case 'update': {
      const t0 = performance.now();
      const newCounts = body.char_counts || {};
      const nodeId = body.node_id || 'unknown';
    
      YdocTransaction(newCounts, nodeId);
      const t1 = performance.now();
    
      console.log(`[State Manager] Received update from ${nodeId}: ${Object.keys(newCounts).length} unique characters`);
    
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          message: 'State updated safely',
          current_total_characters: totalChars,
          timing: { syncWaitMs, transactionMs: Number((t1 - t0).toFixed(2)) }
        }
      };
    }

    case 'get': {
      const tGetStart = performance.now();
      const combinedCounts = {};

      yFrequencyMap.forEach((counter, key) => {
        const char = key.split(':')[0];

        // Extract the numeric value from the PNCounter instance (or fallback to raw number)
        const count = (typeof counter === 'object' && counter !== null && 'value' in counter)
          ? counter.value
          : counter;

        combinedCounts[char] = (combinedCounts[char] || 0) + count;
      });

      const sortedResults = Object.entries(combinedCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

      const winner = sortedResults[0] ? { char: sortedResults[0][0], count: sortedResults[0][1] } : null;

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          char_counts: combinedCounts,
          char_counts_sorted: sortedResults,
          winner,
          connection: {
            wsConnected: provider.wsconnected,
            wsConnecting: provider.wsconnecting,
            synced: provider.synced,
          },
          timing: { syncWaitMs, mergeMs: Number((performance.now() - tGetStart).toFixed(2)) }
        }
      };
    }

    default:
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Unknown operation' }
      };
  }
}