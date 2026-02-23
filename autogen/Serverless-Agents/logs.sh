#!/usr/bin/env bash

NAMESPACE=default

echo "Fetching logs for state-manager pods..."
PODS=$(kubectl get pods -n $NAMESPACE -o name | grep "state-manager")
if [ -z "$PODS" ]; then
  echo "No state-manager pods found"
else
  for pod in $PODS; do
    echo
    echo "==================== $pod ===================="
    kubectl logs -n $NAMESPACE "$pod" --tail=200
  done
fi

echo ""
echo "Fetching logs for agent pods..."
PODS=$(kubectl get pods -n $NAMESPACE -o name | grep "agent")
if [ -z "$PODS" ]; then
  echo "No agent pods found"
else
  for pod in $PODS; do
    echo
    echo "==================== $pod ===================="
    kubectl logs -n $NAMESPACE "$pod" --tail=200
  done
fi
