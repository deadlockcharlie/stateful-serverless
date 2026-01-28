#!/bin/bash

echo "Cleaning up Fission MapReduce deployment..."

# Delete routes first (use httptrigger command)
echo ""
echo "Deleting routes..."
fission httptrigger delete --function wordcount-map 2>/dev/null && echo "  ✓ Deleted wordcount-map route" || echo "  ✗ Route for wordcount-map not found"
fission httptrigger delete --function state-manager 2>/dev/null && echo "  ✓ Deleted state-manager route" || echo "  ✗ Route for state-manager not found"

# Delete functions
echo ""
echo "Deleting functions..."
fission fn delete --name wordcount-map 2>/dev/null && echo "  ✓ Deleted wordcount-map function" || echo "  ✗ Function wordcount-map not found"
fission fn delete --name state-manager 2>/dev/null && echo "  ✓ Deleted state-manager function" || echo "  ✗ Function state-manager not found"

# Optionally delete environment (commented out by default to preserve it)
# echo ""
# echo "Deleting environment..."
# fission env delete --name nodejs-runtime 2>/dev/null && echo "  ✓ Deleted nodejs-runtime environment" || echo "  ✗ Environment nodejs-runtime not found"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "To redeploy, run: ./setup.sh"
