#!/bin/bash

echo "Packaging functions with dependencies..."

# Clean up old packages
rm -rf .fission-packages
mkdir -p .fission-packages/state-manager
mkdir -p .fission-packages/agent

# Install Yjs for state-manager
echo ""
echo "Copying node_modules for state-manager..."
cd ./.fission-packages/state-manager
cp ../../package.json package.json
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
cd ../..

echo "✓ state-manager.zip created ($(du -h .fission-packages/state-manager.zip | cut -f1))"

# Package agent function with dependencies
echo "Packaging agent function with dependencies..."
cd .fission-packages/agent
cp ../../agent.py main.py
cat > requirements.txt << EOF
autogen
httpx
flask
ag2[openai]
EOF
cat > build.sh << EOF
#!/bin/sh
pip install -r \${SRC_PKG}/requirements.txt -t \${SRC_PKG}
cp -r \${SRC_PKG} \${DEPLOY_PKG}
EOF
chmod +x build.sh
zip -r ../agent.zip .
cd ../..

echo "✓ agent.zip created ($(du -h .fission-packages/agent.zip | cut -f1))"

echo ""
echo "✅ Packages created successfully"
echo ""
echo "Verify with: unzip -l .fission-packages/state-manager.zip | grep yjs"
