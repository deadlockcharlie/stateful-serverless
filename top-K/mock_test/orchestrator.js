// stress-test-mock.js
const N = Number(process.env.NUM_CHUNKS) || 100;
const CONCURRENCY = Number(process.env.CONCURRENCY) || 10; // Max active requests at once
const ROUTER = process.env.FISSION_ROUTER || 'http://localhost:9090';

async function fireOne(i) {
  const start = Date.now();
  try {
    const res = await fetch(`${ROUTER}/lettercount/map-mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ i })
    });
    const body = await res.json();
    return { i, ok: res.ok, status: res.status, ms: Date.now() - start, pod: body.pod };
  } catch (err) {
    return { i, ok: false, err: err.message, ms: Date.now() - start };
  }
}

// Worker pool helper: keeps up to `limit` promises running at once
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

(async () => {
  console.log(`Firing ${N} requests (${CONCURRENCY} concurrently) at mock mapper...`);
  const t0 = Date.now();
  
  // CHANGED: Use mapConcurrent instead of Promise.all
  const tasks = Array.from({ length: N }, (_, i) => i);
  const results = await mapConcurrent(tasks, CONCURRENCY, fireOne);
  
  const wallMs = Date.now() - t0;

  const failed = results.filter(r => !r.ok);
  const succeeded = results.filter(r => r.ok);
  const uniquePods = new Set(succeeded.map(r => r.pod)).size;

  console.log(`\nWall time: ${wallMs}ms`);
  console.log(`Succeeded: ${succeeded.length}/${N}, Failed: ${failed.length}/${N}`);
  console.log(`Unique pods that responded: ${uniquePods}`);
  console.log(`Slowest 5:`, succeeded.sort((a,b) => b.ms - a.ms).slice(0,5));
  console.log(`Fastest 5:`, succeeded.sort((a,b) => a.ms - b.ms).slice(0,5));
  if (failed.length) console.log(`Failures:`, failed.slice(0, 10));
})();