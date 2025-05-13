import express from "express";
import * as http from "http";
import { WebsocketConnection } from "./lib/ws";
import { Server } from "socket.io";

const main = async () => {
  const app = express();
  const server = http.createServer(app);

  const io = new Server(server, { cors: { origin: "*" } });

  WebsocketConnection(io);

  const port = 8000;

  server.listen(port, () => {
    console.log("Server started on port", port);
  });
};

export { main };
