import express from 'express';
import * as Y from 'yjs';

const app = express();
app.use(express.json());

const ydoc = new Y.Doc();
const yFrequencyMap = ydoc.getMap('frequencyMap');

let totalChars = 0;
const clientId = ydoc.clientID;

function YdocTransaction (newCounts, nodeId){
    ydoc.transact (()=> {
        Object.entries(newCounts).forEach(([char, number]) => {
            let counterKey = `${char}:${nodeId}`;

            /*if(!yFrequencyMap.has(counterKey)){
                const counter = new Y.PNCounter(); // didn't see in the documentation
                yFrequencyMap.set(counterKey, counter);
            }
      
            // Update the Yjs map safely
            yFrequencyMap.set(counterKey, number);
            counter.increment(count);
            totalChars += count
            */

            yFrequencyMap.set(counterKey, number);
      
            totalChars += number;

        });
    })
}

async function handleOperation(body) {
    const operation = body.operation; // 'update', 'get'
  
    switch (operation) {
      case 'update':
        const newCounts = body.char_counts || {};
        const nodeId = body.node_id || 'unknown';
  
        console.log(`[State Manager] Received update from ${nodeId}: ${Object.keys(newCounts).length} unique characters`);
      
        YdocTransaction(newCounts, nodeId);
  
        return {
          status: 200,
          body: { 
            message: 'State updated safely',
            current_total_characters: totalChars, 
          }
        };
  
      case 'get':
        const combinedCounts = {};
  
        yFrequencyMap.forEach((counter, key) => {
          const count = counter; 
          const char = key.split(':')[0]; 
          combinedCounts[char] = (combinedCounts[char] || 0) + count;
        });
  
        const sortedResults = Object.entries(combinedCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

        // Extract the top character
        const winner = sortedResults[0] ? { char: sortedResults[0][0], count: sortedResults[0][1] } : null;
  
        return {
          status: 200,
          body: {
            char_counts: combinedCounts,
            char_counts_sorted: sortedResults,
            winner: winner
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
}

app.post('/', async (req, res) => {
    const result = await handleOperation(req.body);
    res.status(result.status).json(result.body);
  });
  
app.listen(3000, () => {
    console.log('Safe Yjs Character State Manager listening on http://localhost:3000');
  });