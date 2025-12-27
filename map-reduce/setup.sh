#!/bin/bash

echo "Deploying stateful MapReduce with persistent state manager..."

# Ensure Node.js environment exists
fission env create --name nodejs-runtime \
  --image fission/node-env:latest \
  --poolsize 3 || echo "✓ Environment exists"

sleep 2

# Deploy state manager function
echo ""
echo "1. Deploying state-manager (persistent CRDT store)..."
fission fn create --name state-manager \
  --env nodejs-runtime \
  --code state-manager.js || \
fission fn update --name state-manager \
  --code state-manager.js

fission route create --method POST \
  --url /state-manager \
  --function state-manager 2>/dev/null || echo "  ✓ Route exists"

# Deploy stateful map function
echo ""
echo "2. Deploying wordcount-stateful-map..."
fission fn create --name wordcount-stateful-map \
  --env nodejs-runtime \
  --code map.js || \
fission fn update --name wordcount-stateful-map \
  --code map.js

fission route create --method POST \
  --url /wordcount-stateful/map \
  --function wordcount-stateful-map 2>/dev/null || echo "  ✓ Route exists"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Architecture:"
echo "  ┌─────────────────┐"
echo "  │ State Manager   │ ← Persistent CRDT store (stays alive)"
echo "  │ (Long-running)  │"
echo "  └────────┬────────┘"
echo "           │"
echo "    ┌──────┴──────┐"
echo "    │             │"
echo "┌───▼───┐    ┌───▼───┐"
echo "│ Map 1 │    │ Map 2 │ ← Send updates to state manager"
echo "└───────┘    └───────┘"
echo ""
echo "Test setup:"
echo "  export FISSION_ROUTER=http://localhost:9090"
echo ""
echo "  # Test state manager"
echo "  curl -X POST \$FISSION_ROUTER/state-manager \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"operation\": \"list\"}'"
echo ""
echo "  # Run word count"
echo "  python orchestrator-stateful.py sample.txt 3"