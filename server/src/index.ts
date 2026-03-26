import { WebSocketServer } from "ws";
import { MessageHander } from "./messageHandler";
import { WSMessage } from "./types";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// WebSocket server
const wss = new WebSocketServer({ port: PORT });
const messageHandler = new MessageHander();

wss.on("connection", function connection(ws) {
  ws.on("error", console.error);

  ws.on("message", async function message(data) {
    const clientRequest = JSON.parse(data.toString());

    const response = await messageHandler.handleMessage(clientRequest, ws);

    ws.send(JSON.stringify(response));
  });
});
