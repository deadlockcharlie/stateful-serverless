#!/usr/bin/env python3
"""
Parallel orchestrator - one worker per word
"""
import urllib.request
import json
import sys
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

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

def process_word(word_id, word):
    """Process a single word - called in parallel"""
    start_time = time.time()
    
    result = make_request(
        f"{FISSION_ROUTER}/wordcount/map",
        {
            "text": word,
            "state_manager_url": "http://router.fission/state-manager"
        }
    )
    
    return {
        'word_id': word_id,
        'word': word,
        'result': result,
        'elapsed': time.time() - start_time
    }

def process_words_parallel(words):
    """Process all words in parallel"""
    print(f"\n{'='*60}")
    print(f"PROCESSING {len(words)} WORDS IN PARALLEL")
    print(f"{'='*60}")
    
    start_time = time.time()
    results = []
    
    with ThreadPoolExecutor() as executor:
        futures = {
            executor.submit(process_word, i, word): i
            for i, word in enumerate(words)
        }
        
        for future in as_completed(futures):
            word_id = futures[future]
            try:
                data = future.result()
                results.append(data)
                print(f"✓ Word {word_id + 1}/{len(words)}: '{data['word']}' ({data['elapsed']:.2f}s)")
            except Exception as e:
                print(f"✗ Word {word_id + 1} failed: {e}")
    
    total_time = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"COMPLETE: {len(results)}/{len(words)} words in {total_time:.2f}s")
    print(f"{'='*60}")
    
    return results

def get_final_results():
    """Get final results from state manager"""
    return get_state()

def main():
    if len(sys.argv) < 2:
        print("Usage: python orchestrator.py <input_file> [--reuse]")
        print("   or: python orchestrator.py - (read from stdin)")
        print("\nOptions:")
        print("  --reuse       Reuse existing session")
        sys.exit(1)
    
    # Parse arguments
    input_file = sys.argv[1]
    reuse = False
    
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--reuse':
            reuse = True
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
    
    words = text.split()
    if not words:
        print("Error: No words in input")
        sys.exit(1)
        
    print(f"\n{'='*60}")
    print(f"STATEFUL WORDCOUNT MAPREDUCE")
    print(f"{'='*60}")
    print(f"Mode: {'ACCUMULATE' if reuse else 'NEW'}")
    print(f"Words: {len(words)}")
    
    try:
        if not reuse:
            reset()
        results = process_words_parallel(words)
        final = get_final_results()
        
        # Display results
        print(f"\n{'='*60}")
        print("RESULTS")
        print(f"{'='*60}")
        print(f"Total words: {final.get('total_words', 0)}")
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
            json.dump({'final_state': final, 'word_results': results}, f, indent=2)
        
        print(f"\nResults saved to: wordcount_parallel_results.json")
        
    except Exception as e:
        print(f"\nFailed: {e}")
        print("Make sure state-manager and wordcount-map functions are deployed.")
        sys.exit(1)

if __name__ == "__main__":
    main()