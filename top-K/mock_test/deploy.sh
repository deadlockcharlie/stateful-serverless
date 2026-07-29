mkdir -p map-mock
# Ensure index.js is inside map-mock/ before zipping
cd map-mock && zip -r ../map-mock.zip . && cd ..

# Try creating with poolmgr first; if it already exists, update it with poolmgr
fission fn create --name letter-count-map-mock \
  --env nodejs-runtime \
  --executortype poolmgr \
  --deploy map-mock.zip \
  --entrypoint index 2>/dev/null || \
fission fn update --name letter-count-map-mock \
  --executortype poolmgr \
  --deploy map-mock.zip \
  --entrypoint index

fission route create --method POST \
  --url /lettercount/map-mock \
  --function letter-count-map-mock 2>/dev/null || echo "  ✓ Route exists"