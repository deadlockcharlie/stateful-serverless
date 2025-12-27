const Y = require('yjs');

module.exports = async function(context) {
    const body = context.request.body;
    const combined_counts = body.combined_counts || {};
    const yjs_state = body.yjs_state;
    
    // Reconstruct Yjs document from state
    let ydoc = null;
    let ymap = null;
    
    if (yjs_state) {
        ydoc = new Y.Doc();
        const state = new Uint8Array(yjs_state);
        Y.applyUpdate(ydoc, state);
        ymap = ydoc.getMap('wordcounts');
    }
    
    // Sort results
    const sorted_results = Object.entries(combined_counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    
    const total_words = Object.values(combined_counts)
        .reduce((sum, count) => sum + count, 0);
    
    // Final Yjs state for persistence
    const final_state = yjs_state ? Array.from(Y.encodeStateAsUpdate(ydoc)) : null;
    
    return {
        status: 200,
        body: {
            word_count_results: sorted_results,
            total_words: total_words,
            unique_words: sorted_results.length,
            yjs_state: final_state,
            crdt_info: {
                type: "Y.Map",
                concurrent_safe: true,
                eventually_consistent: true
            }
        },
        headers: {
            'Content-Type': 'application/json'
        }
    };
};