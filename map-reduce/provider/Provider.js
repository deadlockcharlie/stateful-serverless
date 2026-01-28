import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({port: 4040});
const clients = new Set();
const UpdatesRecieved  = new

wss.on('Connection', (ws) => {
    clients.add(ws);

    ws.on('message', (data, isBinary) => {
        console.log('Update recieved')
    })

    ws.on("close", () => {
        clients.delete(ws);
    })

})
