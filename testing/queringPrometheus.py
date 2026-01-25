#!/usr/bin/env python3
from datetime import datetime, timezone
from prometheus_api_client import PrometheusConnect
import matplotlib.pyplot as plt

def seconds_to_promql_duration(seconds: float) -> str:
    total_seconds = int(seconds)

    if total_seconds < 1:
        return "1s"

    if total_seconds % 3600 == 0:
        return f"{total_seconds // 3600}h"

    if total_seconds % 60 == 0:
        return f"{total_seconds // 60}m"

    return f"{total_seconds}s"

def _seconds_between(a, b) -> float:
    """Return seconds between two timestamps, where each may be epoch seconds or datetime."""
    if isinstance(a, datetime) and isinstance(b, datetime):
        return (b - a).total_seconds()
    return float(b) - float(a)

def safe_window_text(start_time, end_time, min_window_seconds: int = 60, pad_seconds: int = 30) -> str:
    """
    increase()/rate() needs enough samples; short benchmarks frequently fall between scrapes.
    This enforces a minimum window and adds a small pad.
    """
    dur = max(0.0, _seconds_between(start_time, end_time))
    window_seconds = max(min_window_seconds, int(dur) + pad_seconds)
    return seconds_to_promql_duration(window_seconds)

def query(prom, promql: str, start_time=None, end_time=None, step: str = "5s"):
    if start_time is not None and end_time is not None:
        try:
            return prom.custom_query_range(query=promql, start_time=start_time, end_time=end_time, step=step)
        except Exception as e:
            raise RuntimeError(f"Range query failed: {e}\nQuery: {promql}")
    else:
        try:
            return prom.custom_query(query=promql)
        except Exception as e:
            raise RuntimeError(f"Instant query failed: {e}\nQuery: {promql}")

def _extract_scalar(res, default=None):
    if not res:
        return default
    try:
        return float(res[0]["value"][1])
    except Exception:
        return default

def _try_queries_first_scalar(prom, promql_list):
    """Run queries in order and return the first non-empty scalar (plus the query used)."""
    for q in promql_list:
        res = query(prom, q)
        val = _extract_scalar(res, default=None)
        if val is not None:
            return val, q
    return None, None

def avg_latency(prom, path: str, start_dt: datetime, end_dt: datetime) -> float | None:
    """
    Average latency over the window:
      sum(increase(sum)[window]) / sum(increase(count)[window])

    Uses an instant query + a safe window to avoid empty/None results when benchmarks are short.
    """
    window = safe_window_text(start_dt, end_dt, min_window_seconds=60, pad_seconds=30)
    expr = (
        f"sum(increase(http_requests_duration_seconds_sum{{path=\"{path}\"}}[{window}]))"
        f" / sum(increase(http_requests_duration_seconds_count{{path=\"{path}\"}}[{window}]))"
    )
    res = query(prom, expr)
    return _extract_scalar(res, default=None)



def function_calls_and_errors_by_path(prom, path: str, start_epoch: float, end_epoch: float):
    """
    Best-effort call and error counts by HTTP path.

    Why: fission_function_calls_total often does NOT have a `path` label, so filtering by path returns empty -> 0.
    This function uses HTTP-layer counters instead.

    Calls:
      - prefer http_requests_total if present
      - fallback to http_requests_duration_seconds_count (acts like a request counter)

    Errors:
      - tries http_requests_total with common status labels (code/status/status_code) filtered to 5xx
      - if none exist, returns 0.0 for errors
    """
    window = safe_window_text(start_epoch, end_epoch, min_window_seconds=60, pad_seconds=30)

    calls_queries = [
        f"sum(increase(http_requests_total{{path=\"{path}\"}}[{window}]))",
        f"sum(increase(http_requests_duration_seconds_count{{path=\"{path}\"}}[{window}]))",
    ]
    calls, calls_used = _try_queries_first_scalar(prom, calls_queries)
    if calls is None:
        calls = 0.0

    error_queries = [
        f"sum(increase(http_requests_total{{path=\"{path}\",code=~\"5..\"}}[{window}]))",
        f"sum(increase(http_requests_total{{path=\"{path}\",status=~\"5..\"}}[{window}]))",
        f"sum(increase(http_requests_total{{path=\"{path}\",status_code=~\"5..\"}}[{window}]))",
    ]
    errs, errs_used = _try_queries_first_scalar(prom, error_queries)
    if errs is None:
        errs = 0.0

    return calls, errs, calls_used, errs_used, window

def cold_starts_and_overhead(prom, func_name: str, start_epoch: float, end_epoch: float):
    """Cold starts and overhead by function_name."""
    window = safe_window_text(start_epoch, end_epoch, min_window_seconds=60, pad_seconds=30)

    cold_q = f"sum(increase(fission_function_cold_starts_total{{function_name=\"{func_name}\"}}[{window}]))"
    overhead_avg_q = (
        f"sum(increase(fission_function_overhead_seconds_sum{{function_name=\"{func_name}\"}}[{window}]))"
        f" / sum(increase(fission_function_overhead_seconds_count{{function_name=\"{func_name}\"}}[{window}]))"
    )

    cold = _extract_scalar(query(prom, cold_q), default=0.0)
    overhead = _extract_scalar(query(prom, overhead_avg_q), default=0.0)
    return cold, overhead, window


def prom_range_to_plot_series(res):
    """
    Convert Prometheus range-query result into plot_timeseries_list input:
      [{'metric': {...}, 'values': [(datetime, float), ...]}, ...]
    """
    out = []
    for s in res or []:
        metric = s.get("metric", {})
        vals = []
        for ts, v in s.get("values", []):
            t = datetime.fromtimestamp(float(ts), tz=timezone.utc)
            vals.append((t, float(v)))
        out.append({"metric": metric, "values": vals})
    return out

def plot_timeseries_list(timeseries, title, filename):
    plt.figure(figsize=(10, 4))
    for s in timeseries:
        xs = [t for t, v in s["values"]]
        ys = [v for t, v in s["values"]]
        label = ",".join([f"{k}={v}" for k, v in s["metric"].items() if k != "__name__"]) or None
        plt.plot(xs, ys, label=label)
    plt.title(title)
    plt.xlabel("time (UTC)")
    plt.ylabel("value")
    if len(timeseries) > 1:
        plt.legend(loc="best")
    plt.tight_layout()
    plt.savefig(filename)
    print(f"Saved plot: {filename}")
    
def in_flight_query(prom, path: str, start_dt: datetime, end_dt: datetime, step: str = "5s", out_dir: str = "."):
    """
    Fetch and plot http_requests_in_flight for a given path over [start_dt, end_dt].
    Saves a PNG in out_dir.
    """
    expr = f"http_requests_in_flight{{path=\"{path}\"}}"
    res = query(prom, expr, start_time=start_dt, end_time=end_dt, step=step)

    series = prom_range_to_plot_series(res)
    if not series:
        print(f"No in-flight timeseries returned for path: {path}")
        return None

    safe_path = path.strip("/").replace("/", "_") or "root"
    filename = f"{out_dir.rstrip('/')}/in_flight_{safe_path}.png"

    plot_timeseries_list(series, f"In-flight requests: {path}", filename)
    return filename

def queryingPrometheus(startTime, endTime, startdateTime, enddateTime, path, func_name: str | None = None):
    prom = PrometheusConnect(url="http://localhost:9091/", disable_ssl=True)

    print(f"\n== Average latency {func_name} ==")
    try:
        avg_lat = avg_latency(prom, path, startdateTime, enddateTime)
        print(f"Average latency for path {path}: {avg_lat} seconds")
    except Exception as e:
        print("Failed to compute average latency:", e)

    print(f"\n== In-flight requests time series {func_name} ==")
    try:
        in_flight_query(prom, path, startdateTime, enddateTime)
    except Exception as e:
        print("Failed to fetch in_flight series:", e)

    print(f"\n== Calls and errors (increase over window) {func_name} ==")
    try:
        calls, errs, calls_used, errs_used, window = function_calls_and_errors_by_path(prom, path, startTime, endTime)
        print(f"Window used: {window}")
        print(f"Calls increase: {calls} (query: {calls_used})")
        print(f"Errors increase: {errs} (query: {errs_used})")
    except Exception as e:
        print("Failed to get calls/errors:", e)

    print(f"\n== Cold starts and overhead {func_name} ==")
    if not func_name:
        print("Skipped (no func_name provided). Pass func_name='your-function-name' if you want these metrics.")
        return

    try:
        cold, overhead, window = cold_starts_and_overhead(prom, func_name, startTime, endTime)
        print(f"Window used: {window}")
        print(f"Cold starts (increase): {cold}, Average scheduling overhead (s): {overhead}")
    except Exception as e:
        print("Failed to get cold starts/overhead:", e)
        
    
