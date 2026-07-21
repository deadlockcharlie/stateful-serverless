#!/bin/bash
mkdir -p .fission-packages

echo "Zipping State Manager with Proxy Wrapper..."
cd state-manager && zip -q -r ../.fission-packages/state-manager.zip index.js state-manager.mjs package.json && cd ..

echo "Zipping Letter Count Map..."
cd letter-count-map && zip -q -r ../.fission-packages/map.zip index.js && cd ..

echo "Packaging complete!"