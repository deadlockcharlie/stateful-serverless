#!/usr/bin/env bash
set -euo pipefail

export NAMESPACE="default"
export MODEL="qwen2.5"

# Delete any existing ollama pods/deployment
kubectl -n "${NAMESPACE}" delete deployment ollama --ignore-not-found=true

kubectl -n "${NAMESPACE}" create deployment ollama --image=ollama/ollama:latest --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "${NAMESPACE}" expose deployment ollama --name ollama --port=11434 --target-port=11434 --type=ClusterIP --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "${NAMESPACE}" wait --for=condition=available deployment/ollama --timeout=180s
POD=$(kubectl -n "${NAMESPACE}" get pods -l app=ollama -o jsonpath='{.items[0].metadata.name}')

kubectl -n "${NAMESPACE}" exec "${POD}" -- ollama pull "${MODEL}"
kubectl -n "${NAMESPACE}" exec "${POD}" -- ollama list