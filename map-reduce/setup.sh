#!/bin/bash

echo "Deploying stateful MapReduce with persistent state manager..."

# Package functions with dependencies
echo ""
echo "Packaging functions with dependencies..."
chmod +x package-functions.sh
./package-functions.sh

# Create with newer Node image
fission env create --name nodejs-runtime \
  --image fission/node-env-16:latest \
  --builder fission/node-builder-16:latest \
  --poolsize 100

sleep 2

# Deploy state manager function with Yjs
echo ""
echo "1. Deploying state-manager (persistent CRDT store with Yjs)..."
fission fn create --name state-manager \
  --env nodejs-runtime \
  --deploy .fission-packages/state-manager.zip \
  --entrypoint index \
  --executortype newdeploy \
  --minscale 1 \
  --maxscale 1
# Seems uncessesary
#fission fn update --name state-manager \ 
#  --deploy .fission-packages/state-manager.zip \
#  --entrypoint index\
fission route create --method POST \
  --url /state-manager \
  --function state-manager 2>/dev/null || echo "  ✓ Route exists"

# Deploy stateful map function
echo ""
echo "2. Deploying wordcount-map..."
fission fn create --name wordcount-map \
  --env nodejs-runtime \
  --deploy .fission-packages/map.zip \
  --entrypoint index || \
fission fn update --name wordcount-map \
  --deploy .fission-packages/map.zip \
  --entrypoint index

fission route create --method POST \
  --url /wordcount/map \
  --function wordcount-map 2>/dev/null || echo "  ✓ Route exists"

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
echo "  python orchestrator.py sample.txt"