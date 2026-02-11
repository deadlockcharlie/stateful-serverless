#!/bin/bash
set -euo pipefail

# Use Minikube's Docker daemon when available; fall back to minikube image build
if minikube -p minikube docker-env >/dev/null 2>&1; then
	eval "$(minikube -p minikube docker-env)"
	build_cmd=(docker build -t provider-image .)
else
	echo "minikube docker-env unavailable (multi-node). Using minikube image build."
	build_cmd=(minikube -p minikube image build -t provider-image .)
fi

# Delete existing provider deployment/pods to force fresh image pull
echo "Deleting existing provider deployment..."
kubectl delete deployment provider --ignore-not-found=true
kubectl delete pods -l app=provider --ignore-not-found=true

echo "Building provider-image..."
"${build_cmd[@]}"

echo "Deploy to Kubernetes"
kubectl apply -f ./provider.yaml

echo "Waiting for provider deployment to be ready..."
kubectl rollout status deployment/provider --timeout=120s

echo "Waiting for provider pod to be ready..."
kubectl wait --for=condition=ready pod -l app=provider --timeout=120s
