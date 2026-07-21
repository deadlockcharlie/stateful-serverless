import * as Y from 'yjs';

const ydoc = new Y.Doc();
const yFrequencyMap = ydoc.getMap('frequencyMap');
let totalChars = 0;

function YdocTransaction(newCounts, nodeId) {
  ydoc.transact(() => {
    Object.entries(newCounts).forEach(([char, number]) => {
      let counterKey = `${char}:${nodeId}`;
      yFrequencyMap.set(counterKey, number);
      totalChars += number;
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

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'State updated safely', current_total_characters: totalChars }
      };

    case 'get':
      const combinedCounts = {};

      yFrequencyMap.forEach((count, key) => {
        const char = key.split(':')[0];
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