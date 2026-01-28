FROM node:24-bullseye

WORKDIR .

COPY ./provider-package.json ./package.json
RUN npm install
RUN apt-get update && apt-get install -y iproute2 iptables
#COPY ./YProvider.js ./server.js
#CMD ["node", "server.js"]

CMD ["npx", "y-websocket"]