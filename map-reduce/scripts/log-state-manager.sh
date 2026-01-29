#!/usr/bin/env bash

NAMESPACE=default
PATTERN=state-manager

for pod in $(kubectl get pods -n $NAMESPACE -o name | grep $PATTERN); do
  echo
  echo "==================== $pod ===================="
  kubectl logs -n $NAMESPACE "$pod" -c nodejs-runtime --tail=200
done
