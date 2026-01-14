#!/bin/bash

echo "Deploying Serverless AI Agent with persistent state manager..."

# Check for OpenAI API key
if [ -z "$OPENAI_API_KEY" ]; then
  echo "ERROR: OPENAI_API_KEY environment variable is not set"
  echo "Please run: export OPENAI_API_KEY='your-api-key'"
  exit 1
fi

# Create/update Kubernetes secret for OpenAI API key
echo "Creating OpenAI API key secret..."
kubectl delete secret openai-api-key 2>/dev/null || true
kubectl create secret generic openai-api-key --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY"

# Package functions with dependencies
echo ""
echo "Packaging functions with dependencies..."
chmod +x package-functions.sh
./package-functions.sh

# Create with newer Node image
fission env create --name nodejs-runtime \
  --image fission/node-env-16:latest \
  --builder fission/node-builder-16:latest \
  --poolsize 3

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

# Deploy stateful agent function
echo ""
echo "2. Deploying agent with AutoGen dependencies..."

# Create Python environment with builder for source packages
fission env create --name python-builder \
  --image ghcr.io/fission/python-env \
  --builder ghcr.io/fission/python-builder \
  --poolsize 1 2>/dev/null || echo "  ✓ Environment exists"

sleep 2

# Create/update function with source package
fission fn create --name agent \
  --env python-builder \
  --src .fission-packages/agent.zip \
  --entrypoint "main" \
  --buildcmd "./build.sh" \
  --secret openai-api-key 2>/dev/null || \
fission fn update --name agent \
  --src .fission-packages/agent.zip \
  --entrypoint "main" \
  --buildcmd "./build.sh" \
  --secret openai-api-key

fission route create --method POST \
  --url /agent \
  --function agent 2>/dev/null || echo "  ✓ Route exists"

echo ""
echo "Waiting for agent build to complete..."
sleep 60

echo "  # Run word count"
echo "  python orchestrator.py sample.txt 3"
