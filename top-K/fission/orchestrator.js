import * as fs from 'node:fs/promises';

const NUM_CHUNKS = Number(process.env.NUM_CHUNKS) || 3;
function splitIntoChunks(text, numChunks) {
  const chunkSize = Math.ceil(text.length / numChunks);
  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    chunks.push(text.slice(i * chunkSize, (i + 1) * chunkSize));
  }
  return chunks;
}

async function reset(routerUrl){
  const resetRes = await fetch(`${routerUrl}/state-manager`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'reset' })
  });

  if (!resetRes.ok) {
    console.error("Failed to reset state manager:", await resetRes.text());
    return;
  }
  console.log("State reset complete.");
}

async function main() {
  const routerUrl = process.env.FISSION_ROUTER || 'http://localhost:9090';
  const internalFissionUrl = 'http://router.fission/state-manager';

  const text = await fs.readFile('./sample.txt', 'utf-8');
  console.log(`Read file of ${text.length} characters.`);

  reset(routerUrl);

  const chunks = splitIntoChunks(text, NUM_CHUNKS);

  console.log(`Splitting into ${NUM_CHUNKS} chunks (~${chunks[0].length} chars each)...`);
  console.log(`Triggering ${NUM_CHUNKS} parallel Fission map containers...`);

  await Promise.all(
    chunks.map((chunk) =>
      fetch(`${routerUrl}/lettercount/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk, stateManagerUrl: internalFissionUrl })
      })
    )
  );

  console.log(`\nAll ${NUM_CHUNKS} mappers finished! Fetching merged state...`);

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