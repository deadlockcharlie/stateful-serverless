import * as Y from "yjs-ypcounter";


const ydoc = new Y.Doc();
const yFrequencyMap = ydoc.getMap('frequencyMap');


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
    });
  });
}
export default async function(context) {
  const body = context.request.body;
  const operation = body.operation;

  switch (operation) {
    case 'update':
      const newCounts = body.char_counts || {};
      const nodeId = body.node_id || 'unknown';

      YdocTransaction(newCounts, nodeId);

      console.log(`[State Manager] Received update from ${nodeId}: ${Object.keys(newCounts).length} unique characters`);

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'State updated safely', current_total_characters: totalChars }
      };

    case 'get':
      case 'get':
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
          body: { char_counts: combinedCounts, char_counts_sorted: sortedResults, winner }
        };

    default:
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Unknown operation' }
      };
  }
}