import subprocess
import time
from datetime import datetime, timezone
from testing.queringPrometheus import queryingPrometheus

BASELINE_SLEEP = 60   # >= scrape interval
COOLDOWN_SLEEP = 60   # >= scrape interval

# Use UTC-aware datetimes to avoid timezone ambiguity with Prometheus
def now_utc():
    return datetime.now(timezone.utc)

# 1) Baseline period (ensure a scrape happens before workload)
baseline_start_epoch = time.time()
baseline_start_dt = now_utc()
time.sleep(BASELINE_SLEEP)

# 2) Workload period (the thing you're benchmarking)
run_start_epoch = time.time()
run_start_dt = now_utc()

result = subprocess.run(
    ["python3", "./map-reduce/orchestrator.py", "./testing/lipsum1000.txt"],
    capture_output=True,
    text=True
)

run_end_epoch = time.time()
run_end_dt = now_utc()

print("Exit code:", result.returncode)
print("STDOUT:\n", result.stdout)
print("STDERR:\n", result.stderr)

# 3) Cooldown period (ensure the final increments are scraped)
time.sleep(COOLDOWN_SLEEP)
query_end_epoch = time.time()
query_end_dt = now_utc()

# 4) Query using the expanded window: baseline -> cooldown
#    This makes increase()/latency robust.
#    If you want "only the run", your PromQL should still compute increase over this window;
#    because baseline happened immediately before, it will approximate the run closely.
queryingPrometheus(baseline_start_epoch, query_end_epoch, baseline_start_dt, query_end_dt, "/wordcount/map", 'wordcount-map')
queryingPrometheus(baseline_start_epoch, query_end_epoch, baseline_start_dt, query_end_dt, "/state-manager",  'state-manager')
