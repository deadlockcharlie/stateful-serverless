#!/bin/bash

echo "Packaging functions with dependencies..."

# Clean up old packages
rm -rf .fission-packages
mkdir -p .fission-packages/state-manager
mkdir -p .fission-packages/agent

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
    "express": "^4.18.2",
    "yjs": "github:deadlockcharlie/yjs#counter"
  }
}
EOF
npm install
cp ../../state-manager.js index.js
cp ../../state-manager.mjs state-manager.mjs
echo "Creating zip with node_modules..."
zip -r ../state-manager.zip . -x "*.git*"
cd ../..

echo "✓ state-manager.zip created ($(du -h .fission-packages/state-manager.zip | cut -f1))"

# Package agent function with dependencies
echo "Packaging agent function with dependencies..."
cd .fission-packages/agent
cp ../../agent.py main.py
cat > requirements.txt << EOF
autogen-agentchat>=0.4.0
autogen-ext[openai]>=0.4.0
httpx>=0.27.0
flask>=2.0.0
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
