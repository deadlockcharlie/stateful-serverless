// stress-test-mock.js
const N = Number(process.env.NUM_CHUNKS) || 100;
const ROUTER = process.env.FISSION_ROUTER || 'http://localhost:9090';// adjust

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

(async () => {
  console.log(`Firing ${N} parallel requests at mock mapper...`);
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: N }, (_, i) => fireOne(i)));
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