#!/usr/bin/env python3
"""
Parallel orchestrator - one worker per word
"""
import urllib.request
import json
import sys
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess

FISSION_ROUTER = os.environ.get('FISSION_ROUTER', 'http://localhost:9090')
print(f"Using FISSION_ROUTER: {FISSION_ROUTER}")

def make_request(url, data, timeout=60):
    """Make HTTP POST request"""
    json_data = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=json_data,
        headers={'Content-Type': 'application/json'}
    )
    
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))

def get_state():
    """Get current state from state manager"""
    return make_request(
        f"{FISSION_ROUTER}/state-manager",
        {"operation": "get"}
    )
    
def reset():
    operation = 'reset'
    
    result = make_request(
        f"{FISSION_ROUTER}/state-manager",
        {
            "operation": operation,
        }
    )
    return result

def process_chunk(chunk_id, chunk, max_retries=3, retry_delay=0.5):
    """Process a chunk of words - called in parallel"""
    start_time = time.time()
    last_error = None
    chunk_text = ' '.join(chunk)

    for attempt in range(1, max_retries + 1):
        try:
            result = make_request(
                f"{FISSION_ROUTER}/wordcount/map",
                {
                    "text": chunk_text,
                    "state_manager_url": "http://router.fission/state-manager"
                }
            )
            return {
                'chunk_id': chunk_id,
                'chunk': chunk,
                'chunk_size': len(chunk),
                'result': result,
                'elapsed': time.time() - start_time
            }
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                time.sleep(retry_delay * attempt)

    raise last_error

def process_words_parallel(words, chunk_size=5):
    """Process words in chunks in parallel"""
    # Split words into chunks
    chunks = [words[i:i + chunk_size] for i in range(0, len(words), chunk_size)]
    
    print(f"\n{'='*60}")
    print(f"PROCESSING {len(words)} WORDS IN {len(chunks)} CHUNKS (size={chunk_size})")
    print(f"{'='*60}")
    
    start_time = time.time()
    results = []
    
    with ThreadPoolExecutor() as executor:
        futures = {
            executor.submit(process_chunk, i, chunk): i
            for i, chunk in enumerate(chunks)
        }
        
        for future in as_completed(futures):
            chunk_id = futures[future]
            try:
                data = future.result()
                results.append(data)
                print(f"✓ Chunk {chunk_id + 1}/{len(chunks)}: {data['chunk_size']} words ({data['elapsed']:.2f}s)")
            except Exception as e:
                print(f"✗ Chunk {chunk_id + 1} failed: {e}")
    
    total_time = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"COMPLETE: {len(results)}/{len(chunks)} chunks in {total_time:.2f}s")
    print(f"{'='*60}")
    
    return results

def main():
    if len(sys.argv) < 2:
        print("Usage: python orchestrator.py <input_file> [--chunk-size SIZE]")
        print("   or: python orchestrator.py - (read from stdin)")
        print("\nOptions:")
        print("  --chunk-size SIZE    Number of words per chunk (default: 5)")
        sys.exit(1)
    
    # Parse arguments
    input_file = sys.argv[1]
    chunk_size = 5
    
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--chunk-size':
            chunk_size = int(sys.argv[i + 1])
            i += 2
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
    
    words = text.split()
    if not words:
        print("Error: No words in input")
        sys.exit(1)
    
    num_chunks = (len(words) + chunk_size - 1) // chunk_size
    
    print(f"\n{'='*60}")
    print(f"STATEFUL WORDCOUNT MAPREDUCE")
    print(f"{'='*60}")
    print(f"Total words: {len(words)}")
    print(f"Chunk size: {chunk_size}")
    print(f"Total chunks: {num_chunks}")
    
    try:
        
        results = process_words_parallel(words, chunk_size)
        
        # Allow CRDT sync time between state-manager pods
        print("Waiting for CRDT sync...")
        #time.sleep(5)
        
        #start_wait = time.time()
        final = get_state()
        #while final.get('total_words') != len(words):
        #    current_total = final.get('total_words', 0)
        #    print(f"Current total words: {current_total}/{len(words)}")
        #    if time.time() - start_wait >= 60:
        #        raise TimeoutError(
        #            f"Timed out after 60s waiting for total_words={len(words)}; last_total={current_total}"
        #        )
        #    time.sleep(1)  # Longer interval to give CRDT time to sync
        #    final = get_state()
        
        # Display results
        print(f"\n{'='*60}")
        print("RESULTS")
        print(f"{'='*60}")
        actual_total = final.get('total_words', 0)
        print(f"Total words: {actual_total} (expected: {len(words)}, diff: {len(words) - actual_total})")
        print(f"Unique words: {final.get('unique_words', 0)}")
        
        word_counts = final.get('word_count_results', [])
        if word_counts:
            print(f"\nTop 20 words:")
            print(f"{'Word':<20} {'Count':>10}")
            print("-" * 32)
            for word, count in word_counts[:20]:
                print(f"{word:<20} {count:>10}")
        
        # Save results
        with open('wordcount_parallel_results.json', 'w') as f:
            json.dump({
                'final_state': final, 
                'chunk_results': results,
                'config': {
                    'chunk_size': chunk_size,
                    'total_words': len(words),
                    'total_chunks': num_chunks
                }
            }, f, indent=2)
        
        print(f"\nResults saved to: wordcount_parallel_results.json")
    
        
    except Exception as e:
        print(f"\nFailed: {e}")
        print("Make sure state-manager and wordcount-map functions are deployed.")
        sys.exit(1)

if __name__ == "__main__":
    main()