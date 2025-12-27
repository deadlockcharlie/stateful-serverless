#!/usr/bin/env python3
"""
Orchestrator with persistent state manager
The state manager function maintains CRDT state throughout execution
"""
import urllib.request
import urllib.error
import json
import sys
import os
import time
import uuid

FISSION_ROUTER = os.environ.get('FISSION_ROUTER', 'http://localhost:9090')

def make_request(url, data, timeout=30):
    """Make HTTP POST request"""
    json_data = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=json_data,
        headers={'Content-Type': 'application/json'}
    )
    
    print(f"  → {url}")
    
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"  ✓ Success")
            return result
    except Exception as e:
        print(f"  ✗ Error: {e}")
        raise

def init_session(session_id, reuse=False):
    """Initialize a new session or reuse existing one in the state manager"""
    print(f"\n{'='*60}")
    if reuse:
        print(f"INITIALIZING OR REUSING SESSION: {session_id}")
    else:
        print(f"INITIALIZING STATE MANAGER SESSION: {session_id}")
    print(f"{'='*60}")
    
    operation = 'get_or_create' if reuse else 'init'
    
    result = make_request(
        f"{FISSION_ROUTER}/state-manager",
        {
            "operation": operation,
            "session_id": session_id
        }
    )
    
    if reuse and result.get('is_new') == False:
        print(f"  ✓ Reusing existing session")
        print(f"    Current words: {result.get('unique_words', 0)} unique")
        print(f"    Previous updates: {result.get('updates_count', 0)}")
    else:
        print(f"  ✓ New session created")
    
    return result

def get_state(session_id):
    """Get current state from state manager"""
    result = make_request(
        f"{FISSION_ROUTER}/state-manager",
        {
            "operation": "get",
            "session_id": session_id
        }
    )
    
    return result

def map_phase(text_chunks, session_id):
    """Execute map phase - each mapper updates the state manager"""
    print(f"\n{'='*60}")
    print(f"MAP PHASE: Processing {len(text_chunks)} chunks")
    print(f"{'='*60}")
    
    # Use internal Kubernetes service URL for pod-to-pod communication
    # The router service in fission namespace
    state_manager_url = "http://router.fission/state-manager"
    print(f"State Manager URL: {state_manager_url} (internal K8s service)\n")
    
    for i, chunk in enumerate(text_chunks):
        print(f"\nChunk {i+1}/{len(text_chunks)}:")
        print(f"  Text: '{chunk[:50]}...'")
        
        result = make_request(
            f"{FISSION_ROUTER}/wordcount-stateful/map",
            {
                "text": chunk,
                "session_id": session_id,
                "state_manager_url": state_manager_url
            }
        )
        
        print(f"  Node: {result.get('node_id', 'unknown')}")
        print(f"  Words: {result.get('word_count', 0)}, Unique: {result.get('unique_words', 0)}")
        print(f"  State updated: {result.get('state_updated', False)}")
        
        if not result.get('state_updated'):
            print(f"  ⚠️  Error: {result.get('error', result.get('message', 'Unknown'))}")
        
        # Small delay to ensure state updates are processed
        time.sleep(0.1)

def get_final_results(session_id):
    """Get final results from state manager"""
    print(f"\n{'='*60}")
    print(f"RETRIEVING FINAL STATE")
    print(f"{'='*60}")
    
    return get_state(session_id)

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
        print("Usage: python orchestrator-stateful.py <input_file> [num_chunks] [--session SESSION_ID] [--reuse]")
        print("   or: python orchestrator-stateful.py - (to read from stdin)")
        print("")
        print("Options:")
        print("  --session SESSION_ID    Use specific session ID instead of generating one")
        print("  --reuse                 Reuse existing session if it exists (accumulate counts)")
        sys.exit(1)
    
    # Parse arguments
    input_file = sys.argv[1]
    num_chunks = 3
    session_id = None
    reuse = False
    
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--session' and i + 1 < len(sys.argv):
            session_id = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == '--reuse':
            reuse = True
            i += 1
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
    if session_id is None:
        session_id = f"wordcount-{uuid.uuid4().hex[:8]}"
    
    print(f"\n{'='*60}")
    print(f"STATEFUL WORDCOUNT MAPREDUCE")
    print(f"{'='*60}")
    print(f"Router: {FISSION_ROUTER}")
    print(f"Session ID: {session_id}")
    if reuse:
        print(f"Mode: ACCUMULATE (adding to existing session)")
    else:
        print(f"Mode: NEW (fresh session)")
    print(f"Input: {len(text)} characters, {len(text.split())} words")
    print(f"Mappers: {num_chunks}")
    
    try:
        # Initialize or reuse session in state manager
        init_session(session_id, reuse=reuse)
        
        # Split and process
        text_chunks = split_text(text, num_chunks)
        
        # Run map phase (updates state manager)
        map_phase(text_chunks, session_id)
        
        # Get final results from state manager
        final = get_final_results(session_id)
        
        # Display results
        print(f"\n{'='*60}")
        print("RESULTS FROM STATE MANAGER")
        print(f"{'='*60}")
        print(f"Session: {final.get('session_id', session_id)}")
        print(f"Total words: {final.get('total_words', 0)}")
        print(f"Unique words: {final.get('unique_words', 0)}")
        print(f"Updates received: {final.get('updates_received', 0)}")
        print(f"Session age: {final.get('session_age_seconds', 0)}s")
        
        results = final.get('word_count_results', [])
        
        if results:
            print(f"\nTop 20 words:")
            print(f"{'Word':<20} {'Count':>10}")
            print("-" * 32)
            
            for word, count in results[:20]:
                print(f"{word:<20} {count:>10}")
        
        # Save results
        with open('wordcount_stateful_results.json', 'w') as f:
            json.dump(final, f, indent=2)
        
        print(f"\nFull results saved to: wordcount_stateful_results.json")
        print(f"\n State manager session '{session_id}' is still active.")
        print(f"   You can query it with: ")
        print(f"   curl -X POST {FISSION_ROUTER}/state-manager \\")
        print(f"     -d '{{\"operation\": \"get\", \"session_id\": \"{session_id}\"}}' \\")
        print(f"     -H 'Content-Type: application/json'")
        
    except Exception as e:
        print(f"\n Pipeline failed: {e}")
        print(f"\nMake sure all functions are deployed:")
        print(f"  - state-manager")
        print(f"  - wordcount-stateful/map")
        sys.exit(1)

if __name__ == "__main__":
    main()