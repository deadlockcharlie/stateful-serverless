import { pipeline } from 'node:stream/promises'; // ADDED: Stream pipeline for decompression
import { createWriteStream, createReadStream, existsSync } from 'node:fs'; // ADDED: Stream filesystem methods
import { Readable } from 'node:stream'; // ADDED: Stream wrapper helper
import createBunzip from 'unbzip2-stream'; // ADDED: Bunzip import
import * as fs from 'node:fs/promises';

const WIKI_DUMP_URL = process.env.WIKI_DUMP_URL
  || 'https://dumps.wikimedia.org/bawiki/latest/bawiki-latest-pages-articles.xml.bz2';
const LOCAL_XML_PATH = './bawiki.xml';
const CONCURRENCY = Number(process.env.CONCURRENCY) || 10;

async function downloadAndDecompress(url, outputPath) {
  console.log(`Downloading and decompressing ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch dump: ${res.statusText}`);

  await pipeline(
    Readable.fromWeb(res.body),
    createBunzip(),
    createWriteStream(outputPath)
  );
  console.log(`Decompressed file saved to ${outputPath}`);
}

// ADDED: Stream chunks from file to prevent standard JS string size limit crash
async function* readChunksFromFile(filePath, chunkSizeMB) {
  const maxBytes = chunkSizeMB * 1024 * 1024;
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk;
    if (Buffer.byteLength(buffer, 'utf-8') >= maxBytes) {
      yield buffer;
      buffer = '';
    }
  }
  if (buffer.length > 0) {
    yield buffer;
  }
}

function getRequiredChunks(sizeInBytes, maxChunkSizeMB = 0.88) {
  const maxSizeBytes = maxChunkSizeMB * 1024 * 1024;
  return Math.max(1, Math.ceil(sizeInBytes / maxSizeBytes));
}

function splitIntoChunks(text, numChunks) {
  const chunkSize = Math.ceil(text.length / numChunks);
  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    chunks.push(text.slice(i * chunkSize, (i + 1) * chunkSize));
  }
  return chunks;
}

//worker pool helper to limit parallel active promises
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/*/helper function to read the wiki dump
async function fetchWikiText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch dump: ${res.status}`);
  const decompressed = Readable.fromWeb(res.body).pipe(createBunzip());
  let text = '';
  for await (const chunk of Readable.wrap(decompressed)) {
    text += chunk.toString('utf-8');
  }
  return text;
}
*/


async function reset(routerUrl, { maxAttempts = 20, stableRounds = 3, delayMs = 300 } = {}) {
  const seen = new Set();
  let stableCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resetRes = await fetch(`${routerUrl}/state-manager`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'reset' })
    });

    if (!resetRes.ok) {
      const errText = await resetRes.text().catch(() => '(no body)');
      console.error(`Reset attempt ${attempt} failed: ${resetRes.status} — ${errText}`);
      stableCount = 0;
      await new Promise(r => setTimeout(r, delayMs));
      continue;
    }

    const body = await resetRes.json();
    const isNewReplica = !seen.has(body.managerId);
    seen.add(body.managerId);

    if (isNewReplica) {
      console.log(`Reset hit new replica: ${body.managerId} (synced=${body.synced})`);
      stableCount = 0; // seeing a new one resets our confidence
    } else {
      stableCount++;
    }

    if (stableCount >= stableRounds) {
      console.log(`Reset confirmed across ${seen.size} replica(s) — ${stableRounds} consecutive hits with no new ones.`);
      return;
    }

    await new Promise(r => setTimeout(r, delayMs));
  }

  console.warn(`Reset gave up after ${maxAttempts} attempts. Replicas seen: ${seen.size} (${[...seen].join(', ')})`);
}

async function main() {
  const tPipelineStart = performance.now();
  const routerUrl = process.env.FISSION_ROUTER || 'http://localhost:9090';
  const internalFissionUrl = 'http://router.fission/state-manager';

  /*
  if (!existsSync(LOCAL_XML_PATH)) {
    console.log(`Local dump not found. Downloading to ${LOCAL_XML_PATH}...`);
    await downloadAndDecompress(WIKI_DUMP_URL, LOCAL_XML_PATH);
  }
  */
  const tReadStart = performance.now();
  const text = await fs.readFile('./ptwiki.txt', 'utf-8');
  //const text = await fetchWikiText(WIKI_DUMP_URL);

  /*const chunks = [];
  for await (const chunk of readChunksFromFile(LOCAL_XML_PATH, CHUNK_SIZE_MB)) {
    chunks.push(chunk);
  }
  */

  const readMs = performance.now() - tReadStart;
  console.log(`Read file of ${text.length} characters. (${readMs.toFixed(2)}ms)`);

  const tResetStart = performance.now();
  await reset(routerUrl);
  const tReset = performance.now() - tResetStart;

  console.log(`State reset complete in ${tReset.toFixed(2)}ms`);

  const tSplitStart = performance.now();
  const fileSizeBytes = Buffer.byteLength(text, 'utf-8'); // Accurate size in bytes

  const NUM_CHUNKS = Number(process.env.NUM_CHUNKS) || getRequiredChunks(fileSizeBytes, 0.88);

  const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  console.log(`Loaded file: ${fileSizeMB} MB (${fileSizeBytes} bytes).`);

  const chunks = splitIntoChunks(text, NUM_CHUNKS);
  const splitMs = performance.now() - tSplitStart;

  console.log(`Splitting into ${NUM_CHUNKS} chunks (~${chunks[0].length} chars each)...`);
  
  
  console.log(`Triggering ${NUM_CHUNKS} Fission map containers (max ${CONCURRENCY} concurrently)...`);

  const tDispatchStart = performance.now();

  const mapperTimings = await mapConcurrent(chunks, CONCURRENCY, async (chunk, i) => {
    const start = performance.now() - tDispatchStart;
    try {
      const r = await fetch(`${routerUrl}/lettercount/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk, stateManagerUrl: internalFissionUrl })
      });
      const end = performance.now() - tDispatchStart;

      if (!r.ok) {
        console.error(`Mapper ${i} failed with status ${r.status}`);
        return { failed: true, start, end };
      }
      const body = await r.json();
      return { ...body.timing, start, end, failed: false };
    } catch (err) {
      console.error(`Mapper ${i} encountered error:`, err.message);
      return { failed: true, start, end: performance.now() - tDispatchStart };
    }
  });

  const dispatchWallMs = performance.now() - tDispatchStart;

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
    connection: finalResults.connection,
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

  await fs.writeFile(
    './run-results.json',
    JSON.stringify({ numChunks: NUM_CHUNKS, mapperTimings }, null, 2)
  );
  console.log('\nSaved timing data to run-results.json');
}

main();