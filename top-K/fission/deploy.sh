#!/bin/bash

echo "Deploying Stateful Top-K Character Counter to Fission..."

# Package functions with dependencies
echo ""
echo "Packaging functions with dependencies..."
chmod +x package-functions.sh
./package-functions.sh

# Create environment if it doesn't exist
fission env create --name nodejs-runtime \
  --image ghcr.io/fission/node-env-22:latest \
  --builder ghcr.io/fission/node-builder-22:latest \
  --poolsize 12 2>/dev/null || echo "  ✓ Environment already exists"

sleep 2

# 1. Deploy or Update state manager function with Yjs
echo ""
echo "1. Deploying state-manager (persistent CRDT store)..."
fission fn create --name state-manager \
  --env nodejs-runtime \
  --src .fission-packages/state-manager.zip \
  --entrypoint index \
  --executortype newdeploy \
  --maxscale 1 \
  --minscale 1 2>/dev/null || \
fission fn update --name state-manager \
  --src .fission-packages/state-manager.zip \
  --entrypoint index \
  --maxscale 1 \
  --minscale 1

# 2. Deploy or Update stateful character map function
echo ""
echo "2. Deploying letter-count-map..."
fission fn create --name letter-count-map \
  --env nodejs-runtime \
  --deploy .fission-packages/map.zip \
  --entrypoint index 2>/dev/null || \
fission fn update --name letter-count-map \
  --deploy .fission-packages/map.zip \
  --entrypoint index

fission route create --method POST \
  --url /lettercount/map \
  --function letter-count-map 2>/dev/null || echo "  ✓ Route exists"

echo ""
echo "✅ Deployment complete!"