#!/usr/bin/env python3
"""
Parallel orchestrator with concurrent mapper execution
Uses Python's concurrent.futures for true parallelism
"""
import urllib.request
import urllib.error
import json
import sys
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

FISSION_ROUTER = os.environ.get('FISSION_ROUTER', 'http://localhost:9090')
print(f"Using FISSION_ROUTER: {FISSION_ROUTER}")

def make_request(url, data, timeout=30):
    """Make HTTP POST request"""
    json_data = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=json_data,
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result
    except Exception as e:
        raise Exception(f"Request to {url} failed: {e}")


def get_state():
    """Get current state from state manager"""
    result = make_request(
        f"{FISSION_ROUTER}/state-manager",
        {
            "operation": "get",
            #"session_id": session_id
        }
    )
    
    return result

def process_chunk(chunk_id, chunk):
    """Process a single chunk - called in parallel"""
    state_manager_url = "http://router.fission/state-manager"
    
    start_time = time.time()
    
    result = make_request(
        f"{FISSION_ROUTER}/wordcount/map",
        {
            "text": chunk,
            #"session_id": session_id,
            "state_manager_url": state_manager_url
        }
    )
    
    elapsed = time.time() - start_time
    
    return {
        'chunk_id': chunk_id,
        'result': result,
        'elapsed': elapsed
    }
    
def reset():
    operation = 'reset'
    
    result = make_request(
        f"{FISSION_ROUTER}/state-manager",
        {
            "operation": operation,
        }
    )

def map_phase_parallel(text_chunks, max_workers=None):
    """Execute map phase in parallel using ThreadPoolExecutor"""
    print(f"\n{'='*60}")
    print(f"PARALLEL MAP PHASE: Processing {len(text_chunks)} chunks")
    print(f"{'='*60}")
    print(f"Max parallel workers: {max_workers or 'auto'}")
    
    start_time = time.time()
    results = []
    
    # Use ThreadPoolExecutor for parallel execution
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all chunk processing tasks
        future_to_chunk = { 
            executor.submit(process_chunk, i, chunk): i 
            for i, chunk in enumerate(text_chunks)
        }
        
        # Process results as they complete
        for future in as_completed(future_to_chunk):
            chunk_id = future_to_chunk[future]
            try:
                data = future.result()
                results.append(data)
                
                result = data['result']
                print(f"\n✓ Chunk {chunk_id + 1}/{len(text_chunks)} completed in {data['elapsed']:.2f}s")
                print(f"  Node: {result.get('node_id', 'unknown')}")
                print(f"  Words: {result.get('word_count', 0)}, Unique: {result.get('unique_words', 0)}")
                print(f"  State updated: {result.get('state_updated', False)}")
                
            except Exception as e:
                print(f"\n✗ Chunk {chunk_id + 1} failed: {e}")
    
    total_time = time.time() - start_time
    
    print(f"\n{'='*60}")
    print(f"MAP PHASE COMPLETE")
    print(f"{'='*60}")
    print(f"Total time: {total_time:.2f}s")
    print(f"Average time per chunk: {total_time/len(text_chunks):.2f}s")
    print(f"Speedup vs sequential: ~{len(text_chunks) * (sum(r['elapsed'] for r in results) / len(results)) / total_time:.1f}x")
    
    return results

def get_final_results():
    """Get final results from state manager"""
    print(f"\n{'='*60}")
    print(f"RETRIEVING FINAL STATE")
    print(f"{'='*60}")
    
    return get_state()

def split_text(text, num_chunks=3):
    """Split text into roughly equal chunks"""
    words = text.split()
    if len(words) == 0:
        return [""]
    
    chunk_size = max(1, len(words) // num_chunks)
    chunks = []
    
    for i in range(num_chunks):
        start = i * chunk_size
        end = start + chunk_size if i < num_chunks - 1 else len(words)
        chunks.append(" ".join(words[start:end]))
    
    return chunks

def main():
    if len(sys.argv) < 2:
        print("Usage: python orchestrator.py <input_file> [num_chunks] [--reuse] [--workers N]")
        print("   or: python orchestrator.py - (to read from stdin)")
        print("")
        print("Options:")
        print("  --workers N             Max parallel workers (default: auto based on chunks)")
        sys.exit(1)
    
    # Parse arguments
    input_file = sys.argv[1]
    num_chunks = 3
    max_workers = None
    
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--workers' and i + 1 < len(sys.argv):
            max_workers = int(sys.argv[i + 1])
            i += 2
        elif sys.argv[i].isdigit():
            num_chunks = int(sys.argv[i])
            i += 1
        else:
            i += 1
    
    # Read input
    if input_file == "-":
        text = sys.stdin.read()
    else:
        try:
            with open(input_file, 'r') as f:
                text = f.read()
        except FileNotFoundError:
            print(f"Error: File '{input_file}' not found")
            sys.exit(1)
    
    # Generate or use provided session ID

    print(f"\n{'='*60}")
    print(f"STATEFUL WORDCOUNT MAPREDUCE")
    print(f"{'='*60}")
    print(f"Router: {FISSION_ROUTER}")

    print(f"Input: {len(text)} characters, {len(text.split())} words")
    print(f"Mappers: {num_chunks} (parallel)")
    print(f"Workers: {max_workers or 'auto'}")
    
    try:
        reset()
        
        # Split and process in parallel
        text_chunks = split_text(text, num_chunks)
        
        # Run map phase with parallel execution
        map_results = map_phase_parallel(text_chunks, max_workers=max_workers)
        
        print(f"Map results {map_results}")
        
        # Get final results from state manager
        final = get_final_results()
        
        # Display results
        print(f"\n{'='*60}")
        print("RESULTS FROM STATE MANAGER")
        print(f"{'='*60}")
        print(f"Total words: {final.get('total_words', 0)}")
        print(f"Unique words: {final.get('unique_words', 0)}")
        print(f"Updates received: {final.get('updates_received', 0)}")
        print(f"State Manager age: {final.get('age_seconds', 0)}s")
        
        results = final.get('word_count_results', [])
        
        if results:
            print(f"\nTop 20 words:")
            print(f"{'Word':<20} {'Count':>10}")
            print("-" * 32)
            
            for word, count in results[:20]:
                print(f"{word:<20} {count:>10}")
        
        # Save results
        with open('wordcount_parallel_results.json', 'w') as f:
            json.dump({
                'final_state': final,
                'execution_stats': {
                    'num_chunks': num_chunks,
                    'parallel_workers': max_workers or num_chunks
                }
            }, f, indent=2)
        
        print(f"\n Full results saved to: wordcount_parallel_results.json")
        print(f"\n State manager is still active.")
        
    except Exception as e:
        print(f"\n Pipeline failed: {e}")
        print(f"\nMake sure all functions are deployed:")
        print(f"  - state-manager")
        print(f"  - wordcount-map")
        sys.exit(1)

if __name__ == "__main__":
    main()