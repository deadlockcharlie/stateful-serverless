const Y = require('yjs');

module.exports = async function(context) {
    const body = context.request.body;
    const results = body.results || [];
    
    // Create a new Yjs document to merge all states
    const mergedDoc = new Y.Doc();
    const mergedMap = mergedDoc.getMap('wordcounts');
    
    // Merge all Yjs states from mappers
    results.forEach(result => {
        if (result.yjs_state) {
            // Convert array back to Uint8Array
            const state = new Uint8Array(result.yjs_state);
            
            // Apply the state update - Yjs CRDT automatically handles conflicts
            Y.applyUpdate(mergedDoc, state);
        }
    });
    
    // Alternative: Manual merge if not using state updates
    // This demonstrates CRDT properties - commutative, associative merge
    results.forEach(result => {
        if (result.yjs_state) {
            const tempDoc = new Y.Doc();
            const state = new Uint8Array(result.yjs_state);
            Y.applyUpdate(tempDoc, state);
            
            const tempMap = tempDoc.getMap('wordcounts');
            tempMap.forEach((count, word) => {
                const currentCount = mergedMap.get(word) || 0;
                mergedMap.set(word, currentCount + count);
            });
        }
    });
    
    // Encode merged state
    const mergedState = Y.encodeStateAsUpdate(mergedDoc);
    
    // Convert map to plain object for response
    const combined_counts = {};
    mergedMap.forEach((count, word) => {
        combined_counts[word] = count;
    });
    
    return {
        status: 200,
        body: {
            yjs_state: Array.from(mergedState),
            combined_counts: combined_counts,
            unique_words: mergedMap.size
        },
        headers: {
            'Content-Type': 'application/json'
        }
    };
};