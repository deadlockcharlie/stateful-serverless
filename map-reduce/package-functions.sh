#!/bin/bash

echo "Packaging functions with dependencies..."

# Clean up old packages
rm -rf .fission-packages
mkdir -p .fission-packages/state-manager
mkdir -p .fission-packages/map

# Install Yjs for state-manager
echo ""
echo "Installing Yjs for state-manager..."
cd .fission-packages/state-manager
cat > package.json << EOF
{
  "name": "state-manager",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "yjs": "^13.6.10"
  }
}
EOF
npm install
cp ../../state-manager.js index.js
echo "Creating zip with node_modules..."
zip -r ../state-manager.zip . -x "*.git*"
cd ../..

echo "✓ state-manager.zip created ($(du -h .fission-packages/state-manager.zip | cut -f1))"

# Package map function (no dependencies needed)
echo "Packaging map function..."
cd .fission-packages/map
cp ../../map.js index.js
zip -r ../map.zip index.js
cd ../..

echo "✓ map.zip created ($(du -h .fission-packages/map.zip | cut -f1))"

echo ""
echo "✅ Packages created successfully"
echo ""
echo "Verify with: unzip -l .fission-packages/state-manager.zip | grep yjs"
