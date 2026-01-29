const WebSocket = require('ws');
const { randomUUID } = require('crypto');

const wss = new WebSocket.Server({port: 1234})

const clients = new Map();
let updatesReceived = []; 

wss.on("connection", (ws) => {          
    
  const uniqueID = `state-manager-${randomUUID()}`
  clients.set(ws, uniqueID);
  console.log(`${uniqueID} Connected to provider, number of clients ${clients.size}`)

  if (updatesReceived.length > 0) {
    ws.send(JSON.stringify(updatesReceived));
    console.log(`Sent update history to ${uniqueID}, ${JSON.stringify(updatesReceived)}`)
  }
  
  ws.on("message", (raw) => {

    let msg;
    msg = JSON.parse(raw);

    update = [msg.newCount, Date.now(), msg.nodeId]
    console.log(`Recieved Update: ${JSON.stringify(update)} from ${uniqueID}`)
    updatesReceived.push(update);

    for (const [client, id] of clients.entries()) {
      if (id !== uniqueID && client.readyState === client.OPEN) {
        client.send(JSON.stringify(update)); // send to all except sender
        console.log('Sending update to other state managers')
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`${uniqueID} Disconnected from provider, number of clients ${clients.size}`)
    if (clients.size == 0) {
       console.log('No more clients left removing history')
       updatesReceived = []
    }
  });

  ws.on("error", (err) => {
      console.error(`WebSocket error for client:`, err);
    });
  
});

console.log("WS server listening on 1234");