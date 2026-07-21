import * as fs from 'node:fs/promises';

async function main() {
  const routerUrl = process.env.FISSION_ROUTER || 'http://localhost:9090';
  const internalFissionUrl = 'http://router.fission/state-manager';

  const text = await fs.readFile('./sample.txt', 'utf-8');
  console.log(`Read file of ${text.length} characters.`);

  const chunkSize = Math.ceil(text.length / 3);
  
  const chunk1 = text.slice(0, chunkSize);
  const chunk2 = text.slice(chunkSize, chunkSize * 2);
  const chunk3 = text.slice(chunkSize * 2);

  console.log(`Splitting into 3 chunks (~${chunkSize} chars each)...`);
  console.log("Triggering 3 parallel Fission map containers...");

  await Promise.all([
    fetch(`${routerUrl}/lettercount/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunk1, stateManagerUrl: internalFissionUrl })
    }),
    fetch(`${routerUrl}/lettercount/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunk2, stateManagerUrl: internalFissionUrl })
    }),
    fetch(`${routerUrl}/lettercount/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunk3, stateManagerUrl: internalFissionUrl })
    })
  ]);

  console.log("\nAll 3 mappers finished! Fetching merged state...");

  const response = await fetch(`${routerUrl}/state-manager`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'get' })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`\n Fission Router Error (${response.status}):`, errorText);
    return;
  }

  const finalResults = await response.json();
  console.log("\n--- FISSION MERGED CRDT RESULTS ---");
  console.log(finalResults);
}

main();