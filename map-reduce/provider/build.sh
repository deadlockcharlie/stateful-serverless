#!/bin/bash
set -euo pipefail

# Use Minikube's Docker daemon
eval "$(minikube -p minikube docker-env)"

# Delete existing provider deployment/pods to force fresh image pull
echo "Deleting existing provider deployment..."
kubectl delete deployment provider --ignore-not-found=true
kubectl delete pods -l app=provider --ignore-not-found=true

echo "Building provider-image..."
docker build -t provider-image .

echo "Deploy to Kubernetes"
kubectl apply -f ./provider.yaml

echo "Waiting for provider pod to be ready..."
kubectl wait --for=condition=ready pod -l app=provider --timeout=60s
