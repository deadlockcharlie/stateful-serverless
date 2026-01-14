#!/bin/bash

echo "Cleaning up Fission Serverless Agents deployment..."

# Delete routes first (use httptrigger command)
echo ""
echo "Deleting routes..."
fission httptrigger delete --function agent 2>/dev/null && echo "  ✓ Deleted agent route" || echo "  ✗ Route for agent not found"
fission httptrigger delete --function state-manager 2>/dev/null && echo "  ✓ Deleted state-manager route" || echo "  ✗ Route for state-manager not found"

# Delete functions
echo ""
echo "Deleting functions..."
fission fn delete --name agent 2>/dev/null && echo "  ✓ Deleted agent function" || echo "  ✗ Function agent not found"
fission fn delete --name state-manager 2>/dev/null && echo "  ✓ Deleted state-manager function" || echo "  ✗ Function state-manager not found"

# Optionally delete environments (commented out by default to preserve them)
# echo ""
# echo "Deleting environments..."
# fission env delete --name nodejs-runtime 2>/dev/null && echo "  ✓ Deleted nodejs-runtime environment" || echo "  ✗ Environment nodejs-runtime not found"
# fission env delete --name python-builder 2>/dev/null && echo "  ✓ Deleted python-builder environment" || echo "  ✗ Environment python-builder not found"

# Clean up local packages
echo ""
echo "Cleaning up local packages..."
rm -rf .fission-packages 2>/dev/null && echo "  ✓ Deleted .fission-packages" || echo "  ✗ .fission-packages not found"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "To redeploy, run: ./setup.sh"
