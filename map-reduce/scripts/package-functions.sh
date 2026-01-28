#!/bin/bash

echo "Packaging functions with dependencies..."

# Clean up old packages
rm -rf ../.fission-packages
mkdir -p ../.fission-packages/state-manager
mkdir -p ../.fission-packages/map

# Install Yjs for state-manager
echo ""
echo "Installing Yjs for state-manager..."
cd ../.fission-packages/state-manager
cat > package.json << EOF
{
  "name": "state-manager",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "express": "^4.18.2",
    "y-webrtc": "^10.3.0",
    "yjs": "github:deadlockcharlie/yjs#counter"
}
EOF
npm install 
pwd
echo 'copy state-manager.js'
cp ../../state-manager.js index.js
pwd
echo 'copy state-manager.mjs'
cp ../../state-manager.mjs state-manager.mjs
pwd
echo "Creating zip with node_modules..."
pwd
zip -r ../state-manager.zip . -x "*.git*"
pwd
cd ../../scripts
pwd

echo "✓ state-manager.zip created ($(du -h .fission-packages/state-manager.zip | cut -f1))"

# Package map function (no dependencies needed)
echo "Packaging map function..."
cd ../.fission-packages/map
cp ../../map.js index.js
zip -r ../map.zip index.js
cd ../../scripts

echo "✓ map.zip created ($(du -h .fission-packages/map.zip | cut -f1))"

echo ""
echo "✅ Packages created successfully"
echo ""
echo "Verify with: unzip -l .fission-packages/state-manager.zip | grep yjs"
