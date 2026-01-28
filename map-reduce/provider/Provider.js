const WebSocket = require('ws');

const wss = new WebSocket.Server({port: 1234})

const clients = new Set();
const updatesReceived = []; 

wss.on("connection", (ws) => {           
  clients.add(ws);

  if (updatesReceived.length > 0) {
    ws.send(updatesReceived);
  }

  ws.on("message", (raw) => {
    let msg;
    msg = JSON.parse(raw.toString());
 
    update = [msg.word_count, Date.now(), msg.nodeId]
    updatesReceived.push();

    for (const client of clients) {
      if (client !== ws && client.readyState === client.OPEN) {
        client.send(update); // send to all except sender
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});

console.log("WS server listening on 1234");