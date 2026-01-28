#!/bin/bash

echo "Updating functions with new code..."

# Package functions with latest code
echo ""
echo "Packaging functions..."
./package-functions.sh

# Update state-manager
echo ""
echo "Updating state-manager function..."
fission fn update --name state-manager \
  --deploy .fission-packages/state-manager.zip \
  --entrypoint index \
  --executortype newdeploy\
  --minscale 1 \
  --maxscale 1

# Update wordcount-map
echo ""
echo "Updating wordcount-map function..."
fission fn update --name wordcount-map \
  --deploy .fission-packages/map.zip \
  --entrypoint index

echo ""
echo "✅ Functions updated successfully!"
echo ""
echo "Wait a moment for pods to restart, then test with:"
echo "  python orchestrator.py sample.txt 3"
