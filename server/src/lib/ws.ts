import WebSocket from "ws";
import { createRouter } from "./worker";
import {
  Consumer,
  Producer,
  Router,
  RtpCapabilities,
  Transport,
} from "mediasoup/node/lib/types";
import { createWebrtcTransport } from "./createWebrtcTransport";

let mediasoupRouter: Router;
let producerTransport: Transport;
let consumerTransport: Transport;
let producer: Producer;
let consumer: Consumer;

const WebsocketConnection = async (websocket: WebSocket.Server) => {
  try {
    mediasoupRouter = await createRouter();
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
      console.log("INCOMING : ", event);

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
        case "createConsumerTransport":
          onCreateConsumerTransport(event, ws);
          break;
        case "connectConsumerTransport":
          onConnectConsumerTransport(event, ws);
          break;
        case "resume":
          onResume(event, ws);
          break;
        case "consume":
          onConsume(event, ws);
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

  const onCreateConsumerTransport = async (event: string, ws: WebSocket) => {
    try {
      const { transport, params } = await createWebrtcTransport(
        mediasoupRouter
      );
      consumerTransport = transport;
      send(ws, "subTransportCreated", params);
    } catch (error) {}
  };

  const onConsume = async (event: any, ws: WebSocket) => {
    const res = await createConsumer(producer, event.rtpCapabilities);
    send(ws, "subscribed", res);
  };

  const onResume = async (event: any, ws: WebSocket) => {
    await consumer.resume();
    send(ws, "resumed", "resumed");
  };

  const onConnectConsumerTransport = async (event: any, ws: WebSocket) => {
    await consumerTransport.connect({ dtlsParameters: event.dtlsParameters });
    send(ws, "subConnected", "consumer transport connected");
  };

  const onConnectProducerTransport = async (event: any, ws: WebSocket) => {
    console.log({ event, dtlsParameters: event?.dtlsParameters?.fingerprints });
    await producerTransport.connect({ dtlsParameters: event.dtlsParameters });
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
    console.log("SENT : ", JSON.stringify(message, null, 2));

    ws.send(resp);
  };

  const broadcast = (ws: WebSocket.Server, type: string, msg: any) => {
    const message = {
      type,
      data: msg,
    };
    const resp = JSON.stringify(message);
    
    console.log("BROADCASTED : ", JSON.stringify(message, null, 2));
    ws.clients.forEach((client) => {
      client.send(resp);
    });
  };

  const createConsumer = async (
    producer: Producer,
    rtpCapabilities: RtpCapabilities
  ) => {
    if (
      !mediasoupRouter.canConsume({ producerId: producer.id, rtpCapabilities })
    ) {
      console.error("can not consume");
      return;
    }

    try {
      // only used when going to resume
      consumer = await consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === "video",
      });
    } catch (error) {
      console.error("consume failed! ", error);
      return;
    }

    return {
      producerId: producer.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  };
};

export { WebsocketConnection };
