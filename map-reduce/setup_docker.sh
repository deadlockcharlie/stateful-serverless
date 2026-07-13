#!/bin/bash

set -e

echo "Docker Desktop Kubernetes + Fission"

# Check Kubernetes
echo ""
echo "Checking Kubernetes cluster..."

kubectl get nodes

echo ""
echo "Using context:"
kubectl config current-context


# Fission namespace
export FISSION_NAMESPACE=fission


echo ""
echo "Installing Fission 1.17.0..."

# Remove old Fission installation if it exists
if kubectl get namespace $FISSION_NAMESPACE >/dev/null 2>&1; then
    echo "Fission namespace already exists"
else
    kubectl create namespace $FISSION_NAMESPACE
fi


# Install CRDs
echo ""
echo "Installing Fission CRDs..."

kubectl create -k \
"https://github.com/fission/fission/crds/v1?ref=v1.17.0" \
2>/dev/null || echo "CRDs already exist"


# Helm repository
echo ""
echo "Adding Fission Helm repository..."

helm repo add fission-charts https://fission.github.io/fission-charts/ \
2>/dev/null || true

helm repo update


# Install Fission
echo ""
echo "Installing Fission..."

helm upgrade --install fission \
  fission-charts/fission-all \
  --namespace $FISSION_NAMESPACE \
  --version 1.17.0 \
  --set serviceType=NodePort \
  --set routerServiceType=NodePort


echo ""
echo "Waiting for Fission pods..."

kubectl wait \
  --for=condition=Ready \
  pod \
  --all \
  -n $FISSION_NAMESPACE \
  --timeout=300s

echo ""

echo "Fission installed successfully!"


echo ""
echo "Starting Fission router..."
echo "Keep this terminal open."

kubectl port-forward \
  -n fission \
  svc/router \
  9090:80

#to run:
#chmod +x setup_docker.sh
#./setup_docker.sh
# then in another terminal:
# cd scripts 
# ./setup.sh