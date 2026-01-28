import * as Y from "./node_modules/yjs/src/index.js";
import { YPNCounter as PNCounter } from "./node_modules/yjs/src/types/YPNCounter.js";
import Websocket from 'wss'

// Persistent state for the process lifetime
const ydoc = new Y.Doc();
const ywordCounts = ydoc.getMap('word_counts');
const updates = [];
const created = Date.now();
const ws = new Websocket("ws://host.minikube.internal:1234")

ws.onmessage = (event) =>{
    console.log('Recieved updates')
    event.data.forEach(([wordounts, _, _]) => {
        YdocTransaction(wordounts)
    });
}

function YdocTransaction(newCounts){
    ydoc.transact(() => {
        Object.entries(newCounts).forEach(([word, count]) => {
            // Get or create counter for this word (atomic)
            if (!ywordCounts.has(word)) {
                const counter = new PNCounter();
                ywordCounts.set(word, counter);
            }

            const counter = ywordCounts.get(word);
            counter.increment(count);
        });
    });
}

export default async function(context) {
    const body = context.request.body;
    const operation = body.operation; // 'init', 'update', 'get', 'merge', 'reset'
    
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
            const newCounts = body.word_counts || {};
            const nodeId = body.node_id || 'unknown';
            const timestamp = body.timestamp || Date.now();
            
            console.log(`[State Manager] Received update from ${nodeId}: ${Object.keys(newCounts).length} words`);
            
            // Atomic updates using Yjs transactions
            YdocTransaction(newCounts)
            
            // Track local update history
            updates.push({
                nodeId,
                timestamp,
                wordCount: Object.keys(newCounts).length
            });
            
            ws.send({
                newCounts,
                nodeId
            })

            const totalUniqueWords = ywordCounts.size;
            ywordCounts.forEach((counter, word) => {
                console.log(`${word}: ${counter.value}`)
            });
            console.log(`[State Manager] Total unique words now: ${totalUniqueWords}`);
            
            return {
                status: 200,
                body: {
                    message: 'State updated',
                    current_unique_words: totalUniqueWords,
                    total_updates: updates.length
                }
            };
            
        case 'get':
            // Retrieve current state from Yjs map
            const wordCounts = {};
            ywordCounts.forEach((counter, word) => {
                wordCounts[word] = counter.value;
            });
            const sorted = Object.entries(wordCounts)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            const total = Object.values(wordCounts)
                .reduce((sum, c) => sum + c, 0);
            console.log(`final words: ${JSON.stringify(sorted)}`); // Debugging line
            return {
                status: 200,
                body: {
                    word_counts: wordCounts,
                    word_count_results: sorted,
                    total_words: total,
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