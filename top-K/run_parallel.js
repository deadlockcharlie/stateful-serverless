import * as fs from 'node:fs/promises';
import { countLetters } from './map_parallel.js';

async function main() {
  const stateManagerUrl = 'http://localhost:3000';
  
  const text = await fs.readFile('./sample.txt', 'utf-8');
  console.log(`Read file of ${text.length} characters.`);

  const half = Math.ceil(text.length / 2);
  const chunk1 = text.slice(0, half);
  const chunk2 = text.slice(half);

  await Promise.all([
    countLetters(chunk1, stateManagerUrl),
    countLetters(chunk2, stateManagerUrl)
  ]);

  console.log("\nExecution finished! Fetching final aggregated state...");

  const response = await fetch(stateManagerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'get' })
  });
  
  const finalResults = await response.json();
  console.log("\n--- MERGED CRDT RESULTS ---");
  console.log(JSON.stringify(finalResults, null, 2));
}

main();