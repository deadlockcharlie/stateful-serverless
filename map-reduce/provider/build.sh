#!/bin/bash

# Stop and remove any running container with provider-image
container_id=$(docker ps -aq --filter ancestor=provider-image)
if [ -n "$container_id" ]; then
	echo "Stopping running provider-image container(s)..."
	docker stop $container_id
	echo "Removing provider-image container(s)..."
	docker rm $container_id
fi

echo "Building provider-image..."
docker build -t provider-image .

echo "Running provider-image container..."
docker run provider-image
