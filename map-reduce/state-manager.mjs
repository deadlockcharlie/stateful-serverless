import * as Y from "yjs-ypcounter";
import { WebsocketProvider } from "y-websocket-pncounter";
import WebSocketPolyfill from "ws";

// Persistent state for the process lifetime
let ydoc = new Y.Doc();

const provider = new WebsocketProvider(
  "http://provider-service.default.svc.cluster.local:1234",
  //"ws://host.minikube.internal:1234",
  "Key",
  ydoc,
  { WebSocketPolyfill }
);

let ywordCounts = ydoc.getMap('word_counts');
const updates = [];
const created = Date.now();
let totalWords = 0;
const clientId = ydoc.clientID;

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

//ydoc.on("update", (update, origin) => {
//  console.log("[yjs] doc update bytes:", update.length, "origin:", origin === provider ? "remote" : "local");
//});

// Observe changes to the word_counts map
ywordCounts.observe((event, transaction) => {
  const isRemote = transaction.origin === provider;
  console.log(`[ywordCounts] Change detected - origin: ${isRemote ? "remote" : "local"}`);
  
  event.changes.keys.forEach((change, key) => {
    if (change.action === 'add') {
      const counter = ywordCounts.get(key);
      console.log(`  [ADD] word="${key}" value=${counter?.value ?? 'N/A'}`);
    } else if (change.action === 'update') {
      const counter = ywordCounts.get(key);
      console.log(`  [UPDATE] word="${key}" newValue=${counter?.value ?? 'N/A'}`);
    } else if (change.action === 'delete') {
      console.log(`  [DELETE] word="${key}"`);
    }
  });
  
  console.log(`  Total unique: ${ywordCounts.size}, Total Word: ${totalWords}`);
});

function YdocTransaction(newCounts){
    ydoc.transact(() => {
        Object.entries(newCounts).forEach(([word, count]) => {
            // Get or create counter for this word (atomic)
            let counterKey = `${word}:${clientId}`
            if (!ywordCounts.has(counterKey)) {
                const counter = new Y.PNCounter(); // Generate Unique ID
                ywordCounts.set(counterKey, counter);
            }
            const counter = ywordCounts.get(counterKey);
            counter.increment(count);
            totalWords += count;
        });
    });
}

export default async function(context) {
     const body = context.request.body;
     const operation = body.operation; // 'init', 'update', 'get', 'merge', 'reset'
     
     // Wait for initial sync before processing to avoid creating duplicate counters
     try {
         await Promise.race([
             syncPromise,
             new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 5000))
         ]);
     } catch (e) {
         console.log("[State Manager] Sync wait failed:", e.message, "- proceeding anyway");
     }
     
     switch(operation) {
         case 'reset':
             // Remove all keys from ywordCounts
             ywordCounts.forEach((_, word) => {
                 ywordCounts.delete(word);
             });
             updates.length = 0; // Optionally clear update history
             return {
                 status: 200,
                 body: { message: 'State reset' }
             };          
         case 'update':
             const newCount = body.word_counts || {};
             const nodeId = body.node_id || 'unknown';
             const timestamp = body.timestamp || Date.now();          
             console.log(`[State Manager] Received update from ${nodeId}: ${Object.keys(newCount).length} words`);          
             // Atomic updates using Yjs transactions
             YdocTransaction(newCount)          
             // Track local update history
             updates.push({
                 nodeId,
                 timestamp,
                 wordCount: Object.keys(newCount).length
             });          

             const totalUniqueWords = ywordCounts.size;
             console.log(`[State Manager] Total unique: ${totalUniqueWords}, Total Word: ${totalWords}`);         
             return {
                 status: 200,
                 body: {
                     message: 'State updated',
                     current_unique_words: totalUniqueWords,
                     total_updates: updates.length
                 }
             };          
         case 'get':
             // Retrieve current state from Yjs map and compute totals from CRDT
             const wordCounts = {};
             let computedTotalWords = 0;
             ywordCounts.forEach((counter, key) => {
                 const count = counter.value;
                 const word = key.split(':')[0]
                 wordCounts[word] = (wordCounts[word] || 0) + count;
                 computedTotalWords += count;
             });

            const sorted = Object.entries(wordCounts)
                 .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
             //console.log(`final words: ${JSON.stringify(sorted)}`); // Debugging line

             return {
                 status: 200,
                 body: {
                     word_counts: wordCounts,
                     word_count_results: sorted,
                     total_words: computedTotalWords,
                     unique_words: sorted.length,
                     updates_received: updates.length,
                     age_seconds: Math.floor((Date.now() - created) / 1000)
                 }
             };                
         default:
             return {
                 status: 400,
                 body: {
                     error: 'Unknown operation',
                     valid_operations: ['update', 'get']
                 }
             };
     }
 };