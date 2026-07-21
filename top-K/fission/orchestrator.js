import * as fs from 'node:fs/promises';

async function main() {
  const routerUrl = 'http://localhost:9090';
  const internalFissionUrl = 'http://router.fission/state-manager'; // Internal DNS inside k8s cluster

  const text = await fs.readFile('./sample.txt', 'utf-8');
  const half = Math.ceil(text.length / 2);

  console.log("Triggering parallel cluster containers...");
  
  await Promise.all([
    fetch(`${routerUrl}/lettercount/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, half), stateManagerUrl: internalFissionUrl })
    }),
    fetch(`${routerUrl}/lettercount/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(half), stateManagerUrl: internalFissionUrl })
    })
  ]);

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