// Stateful Yjs CRDT state manager with atomic counter operations

import * as Y from "./node_modules/yjs/src/index.js";
import { YPNCounter as PNCounter } from "./node_modules/yjs/src/types/YPNCounter.js";
import { WebsocketProvider } from "y-websocket";

// In-memory state store (persists as long as pod is alive)
const sessions = new Map();

// Initialize a new Yjs document for a session
function createSession() {
    const ydoc = new Y.Doc();
    const ywordCounts = ydoc.getMap('word_counts');
    const provider = new WebsocketProvider(
        "ws://localhost:1234", 
        "my-room",             
        ydoc
    )

    return {
        ydoc,
        ywordCounts,
        provider,
        updates: [],
        created: Date.now(),
        lastAccess: Date.now()
    };
}

export default async function(context) {
    const body = context.request.body;
    const provider = body.provider;
    const operation = body.operation; // 'init', 'update', 'get', 'merge', 'reset'
    const sessionId = body.session_id || 'default';
    
    // Initialize session if doesn't exist
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, createSession());
    }
    
    const session = sessions.get(sessionId);
    const provder = sessions.get(provider);
    session.lastAccess = Date.now();
    
    switch(operation) {
        case 'init':
            // Initialize or reset session with fresh Yjs document
            sessions.set(sessionId, createSession());
            return {
                status: 200,
                body: {
                    message: 'Session initialized',
                    session_id: sessionId
                }
            };
            
        case 'get_or_create':
            // Get existing session or create new one (doesn't reset if exists)
            const isNew = !sessions.has(sessionId);
            if (isNew) {
                sessions.set(sessionId, createSession());
            }
            
            const currentSession = sessions.get(sessionId);
            
            return {
                status: 200,
                body: {
                    message: isNew ? 'Session created' : 'Session exists',
                    session_id: sessionId,
                    is_new: isNew,
                    unique_words: currentSession.ywordCounts.size,
                    updates_count: currentSession.updates.length
                }
            };
            
        case 'update':
            const newCounts = body.word_counts || {};
            const nodeId = body.node_id || 'unknown';
            const timestamp = body.timestamp || Date.now();
            
            console.log(`[State Manager] Received update from ${nodeId}: ${Object.keys(newCounts).length} words`);
            
            // Atomic updates using Yjs transactions
            session.ydoc.transact(() => {
                Object.entries(newCounts).forEach(([word, count]) => {
                    // Get or create counter for this word (atomic)
                    if (!session.ywordCounts.has(word)) {
                        const counter = new PNCounter();
                        session.ywordCounts.set(word, counter);
                    }
                    
                    const counter = session.ywordCounts.get(word);
                    counter.increment(count);
                });
            });
            
            // Track update history
            session.updates.push({
                nodeId,
                timestamp,
                wordCount: Object.keys(newCounts).length
            });
            
            const totalUniqueWords = session.ywordCounts.size;
            
            console.log(`[State Manager] Total unique words now: ${totalUniqueWords}`);
            
            return {
                status: 200,
                body: {
                    message: 'State updated',
                    session_id: sessionId,
                    current_unique_words: totalUniqueWords,
                    total_updates: session.updates.length
                }
            };
            
        case 'get':
            // Retrieve current state from Yjs map
            const wordCounts = {};
            session.ywordCounts.forEach((counter, word) => {
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
                    session_id: sessionId,
                    word_counts: wordCounts,
                    word_count_results: sorted,
                    total_words: total,
                    unique_words: sorted.length,
                    updates_received: session.updates.length,
                    session_age_seconds: Math.floor((Date.now() - session.created) / 1000)
                }
            };
            
        case 'merge':
            // Merge another session's state (CRDT property)
            const otherSessionId = body.other_session_id;
            if (!sessions.has(otherSessionId)) {
                return {
                    status: 404,
                    body: { error: 'Other session not found' }
                };
            }
            
            const otherSession = sessions.get(otherSessionId);
            
            // Merge word counts atomically
            session.ydoc.transact(() => {
                otherSession.ywordCounts.forEach((otherCounter, word) => {
                    if (!session.ywordCounts.has(word)) {
                        session.ywordCounts.set(word, otherCounter);
                    }
                    
                    const currentCounter = session.ywordCounts.get(word);
                    currentCounter.increment(otherCounter.value);
                });
            });
            
            return {
                status: 200,
                body: {
                    message: 'Sessions merged',
                    session_id: sessionId,
                    unique_words: session.ywordCounts.size
                }
            };
            
        case 'reset':
            // Clean up old sessions
            const maxAge = body.max_age_seconds || 3600;
            const now = Date.now();
            let deleted = 0;
            
            sessions.forEach((sess, id) => {
                if ((now - sess.lastAccess) / 1000 > maxAge) {
                    sessions.delete(id);
                    deleted++;
                }
            });
            
            return {
                status: 200,
                body: {
                    message: 'Cleanup complete',
                    sessions_deleted: deleted,
                    active_sessions: sessions.size
                }
            };
            
        case 'list':
            // List all active sessions
            const sessionList = [];
            sessions.forEach((sess, id) => {
                sessionList.push({
                    session_id: id,
                    unique_words: sess.ywordCounts.size,
                    updates: sess.updates.length,
                    age_seconds: Math.floor((Date.now() - sess.created) / 1000)
                });
            });
            
            return {
                status: 200,
                body: {
                    sessions: sessionList,
                    total: sessions.size
                }
            };
            
        default:
            return {
                status: 400,
                body: {
                    error: 'Unknown operation',
                    valid_operations: ['init', 'get_or_create', 'update', 'get', 'merge', 'reset', 'list']
                }
            };
    }
};