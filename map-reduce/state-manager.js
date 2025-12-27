// Stateful Yjs CRDT state manager
// This function maintains state across multiple MapReduce operations
// Uses in-memory storage (or can be backed by Redis/database)

// In-memory state store (persists as long as pod is alive)
const sessions = new Map();

module.exports = async function(context) {
    const body = context.request.body;
    const operation = body.operation; // 'init', 'update', 'get', 'merge', 'reset'
    const sessionId = body.session_id || 'default';
    
    // Initialize session if doesn't exist
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            wordCounts: {},
            updates: [],
            created: Date.now(),
            lastAccess: Date.now()
        });
    }
    
    const session = sessions.get(sessionId);
    session.lastAccess = Date.now();
    
    switch(operation) {
        case 'init':
            // Initialize or reset session
            session.wordCounts = {};
            session.updates = [];
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
                sessions.set(sessionId, {
                    wordCounts: {},
                    updates: [],
                    created: Date.now(),
                    lastAccess: Date.now()
                });
            }
            
            return {
                status: 200,
                body: {
                    message: isNew ? 'Session created' : 'Session exists',
                    session_id: sessionId,
                    is_new: isNew,
                    unique_words: Object.keys(sessions.get(sessionId).wordCounts).length,
                    updates_count: sessions.get(sessionId).updates.length
                }
            };
            
        case 'update':
            // Receive updates from mappers/reducers (CRDT merge)
            const newCounts = body.word_counts || {};
            const nodeId = body.node_id || 'unknown';
            const timestamp = body.timestamp || Date.now();
            
            // CRDT merge: commutative addition
            Object.entries(newCounts).forEach(([word, count]) => {
                session.wordCounts[word] = (session.wordCounts[word] || 0) + count;
            });
            
            // Track update history
            session.updates.push({
                nodeId,
                timestamp,
                wordCount: Object.keys(newCounts).length
            });
            
            return {
                status: 200,
                body: {
                    message: 'State updated',
                    session_id: sessionId,
                    current_unique_words: Object.keys(session.wordCounts).length,
                    total_updates: session.updates.length
                }
            };
            
        case 'get':
            // Retrieve current state
            const sorted = Object.entries(session.wordCounts)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            
            const total = Object.values(session.wordCounts)
                .reduce((sum, c) => sum + c, 0);
            
            return {
                status: 200,
                body: {
                    session_id: sessionId,
                    word_counts: session.wordCounts,
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
            Object.entries(otherSession.wordCounts).forEach(([word, count]) => {
                session.wordCounts[word] = (session.wordCounts[word] || 0) + count;
            });
            
            return {
                status: 200,
                body: {
                    message: 'Sessions merged',
                    session_id: sessionId,
                    unique_words: Object.keys(session.wordCounts).length
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
                    unique_words: Object.keys(sess.wordCounts).length,
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