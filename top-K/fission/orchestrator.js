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
  //console.log("State reset complete.");
}

async function main() {
  const tPipelineStart = performance.now();
  const routerUrl = process.env.FISSION_ROUTER || 'http://localhost:9090';
  const internalFissionUrl = 'http://router.fission/state-manager';

  const tReadStart = performance.now();
  const text = await fs.readFile('./arzwiki.txt', 'utf-8');
  const readMs = performance.now() - tReadStart;
  console.log(`Read file of ${text.length} characters. (${readMs.toFixed(2)}ms)`);

  const tResetStart = performance.now();
  await reset(routerUrl);
  const tReset = performance.now() - tResetStart;

  console.log(`State reset complete in ${tReset.toFixed(2)}ms`);

  const tSplitStart = performance.now();
  const chunks = splitIntoChunks(text, NUM_CHUNKS);
  const splitMs = performance.now() - tSplitStart;

  console.log(`Splitting into ${NUM_CHUNKS} chunks (~${chunks[0].length} chars each)...`);
  console.log(`Triggering ${NUM_CHUNKS} parallel Fission map containers...`);

  const tDispatchStart = performance.now();

  const mapResponses = await Promise.all(
    chunks.map((chunk) =>
      fetch(`${routerUrl}/lettercount/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk, stateManagerUrl: internalFissionUrl })
      })
    )
  );

  const dispatchWallMs = performance.now() - tDispatchStart;

  const mapperTimings = await Promise.all(
    mapResponses.map(async (r, i) => {
      if (!r.ok) {
        console.error(`Mapper ${i} failed with status ${r.status}`);
        return null;
      }
      const body = await r.json();
      return body.timing || null;
    })
  );

  console.log(`\nAll ${NUM_CHUNKS} mappers finished! Fetching merged state...`);

  const tGetStart = performance.now();
  const response = await fetch(`${routerUrl}/state-manager`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'get' })
  });
  const getMs = performance.now() - tGetStart;

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`\n Fission Router Error (${response.status}):`, errorText);
    return;
  }

  const finalResults = await response.json();
  console.log("\n--- FISSION MERGED CRDT RESULTS ---");
  console.log({
    winner: finalResults.winner,
    timing: finalResults.timing
  });

  console.log("\n--- TIMING BREAKDOWN ---");
  console.log(`Reset state-manager:              ${tReset.toFixed(2)}ms`);
  console.log(`Load (read file):              ${readMs.toFixed(2)}ms`);
  console.log(`Split into chunks:             ${splitMs.toFixed(2)}ms`);
  console.log(`Dispatch (parallel wall time): ${dispatchWallMs.toFixed(2)}ms`);
  mapperTimings.forEach((t, i) => {
    if (!t) {
      console.log(`  [chunk ${i}] no timing data (failed)`);
      return;
    }
    console.log(
      `  [chunk ${i}] node=${t.nodeId} compute=${t.computeMs}ms update=${t.updateMs}ms total=${t.totalMs}ms`
    );
  });
  console.log(`Final 'get' fetch:             ${getMs.toFixed(2)}ms`);

  const totalPipelineMs = performance.now() - tPipelineStart;
  console.log(`\nTOTAL TIME (start to finish): ${totalPipelineMs.toFixed(2)}ms`);
}

main();