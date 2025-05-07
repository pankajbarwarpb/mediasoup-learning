import WebSocket from "ws";
import { createWorker } from "./worker";
import { Producer, Router, Transport } from "mediasoup/node/lib/types";
import { createWebrtcTransport } from "./createWebrtcTransport";

let mediasoupRouter: Router;
let producerTransport: Transport;
let producer: Producer;

const WebsocketConnection = async (websocket: WebSocket.Server) => {
  try {
    mediasoupRouter = await createWorker();
  } catch (error) {
    throw error;
  }

  websocket.on("connection", (ws: WebSocket) => {
    ws.on("message", (message: string) => {
      const jsonValidation = IsJsonString(message);
      if (!jsonValidation) {
        console.error("json error");
        return;
      }

      const event = JSON.parse(message);

      switch (event.type) {
        case "getRouterRtpCapabilities":
          onRouterRtpCapabilities(event, ws);
          break;
        case "createProducerTransport":
          onCreateProducerTransport(event, ws);
          break;
        case "connectProducerTransport":
          onConnectProducerTransport(event, ws);
          break;
        case "produce":
          onProduce(event, ws, websocket);
          break;
        default:
          break;
      }
    });

    ws.on("close", () => {
      console.log("Connection closed");
    });

    ws.on("error", (e) => {
      console.log("Connection error", { e });
    });
  });

  const onProduce = async (
    event: any,
    ws: WebSocket,
    websocket: WebSocket.Server
  ) => {
    const { kind, rtpParameters } = event;
    producer = await producerTransport.produce({ kind, rtpParameters });
    const resp = {
      id: producer.id,
    };

    send(ws, "produced", resp);
    broadcast(websocket, "newProducer", "new user");
  };

  const onRouterRtpCapabilities = (event: string, ws: WebSocket) => {
    send(ws, "routerCapabilities", mediasoupRouter.rtpCapabilities);
  };

  const onCreateProducerTransport = async (event: string, ws: WebSocket) => {
    try {
      const { transport, params } = await createWebrtcTransport(
        mediasoupRouter
      );
      producerTransport = transport;
      send(ws, "producerTransportCreated", params);
    } catch (error) {
      console.error(error);
      send(ws, "error", error);
    }
  };

  const onConnectProducerTransport = async (event: any, ws: WebSocket) => {
    await producerTransport.connect({ dtlsParameters: event.dtlsPrameters });
    send(ws, "producerConnected", "producer connected");
  };

  const IsJsonString = (str: string) => {
    try {
      JSON.parse(str);
    } catch (error) {
      return false;
    }
    return true;
  };

  const send = (ws: WebSocket, type: string, msg: any) => {
    const message = {
      type,
      data: msg,
    };

    const resp = JSON.stringify(message);

    ws.send(resp);
  };

  const broadcast = (ws: WebSocket.Server, type: string, msg: any) => {
    const message = {
      type,
      data: msg,
    };
    const resp = JSON.stringify(message);

    ws.clients.forEach((client) => {
      client.send(resp);
    });
  };
};

export { WebsocketConnection };
