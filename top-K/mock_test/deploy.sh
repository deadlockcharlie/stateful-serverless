mkdir -p map-mock
# put index.js above in map-mock/
cd map-mock && zip -r ../map-mock.zip . && cd ..

mkdir -p map-mock
# put index.js above in map-mock/
cd map-mock && zip -r ../map-mock.zip . && cd ..

fission fn create --name letter-count-map-mock \
  --env nodejs-runtime \
  --deploy map-mock.zip \
  --entrypoint index 2>/dev/null || \
fission fn update --name letter-count-map-mock \
  --executortype poolmgr \
  --deploy map-mock.zip \
  --entrypoint index

fission route create --method POST \
  --url /lettercount/map-mock \
  --function letter-count-map-mock 2>/dev/null || echo "  ✓ Route exists"

