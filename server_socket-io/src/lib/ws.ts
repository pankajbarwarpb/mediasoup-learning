import { Server, Socket } from "socket.io";
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

interface ProducerMap {
  [producerId: string]: Producer;
}

interface ProducerTransportInfo {
  transport: Transport;
  producers: Map<string, Producer>;
}

const producerTransports: Map<string, ProducerTransportInfo> = new Map();

interface ConsumerMap {
  [consumerId: string]: Consumer;
}

interface ConsumerTransportInfo {
  transport: Transport;
  consumers: Map<string, Consumer>;
}

const consumerTransports: Map<string, ConsumerTransportInfo> = new Map();

const WebsocketConnection = async (io: Server) => {
  try {
    mediasoupRouter = await createRouter();
  } catch (error) {
    throw error;
  }

  io.on("connection", (socket: Socket) => {
    console.log("New Connection", socket.id);

    socket.onAny((ev) => {
      console.log("onAny: ", { ev });
    });

    socket.on("getRouterRtpCapabilities", (event) => {
      onRouterRtpCapabilities(event, socket);
    });

    socket.on("createProducerTransport", (event) => {
      onCreateProducerTransport(event, socket);
    });

    socket.on("connectProducerTransport", (event) => {
      onConnectProducerTransport(event, socket);
    });

    socket.on("produce", (event) => {
      onProduce(event, socket, io);
    });

    socket.on("createConsumerTransport", (event) => {
      onCreateConsumerTransport(event, socket);
    });

    socket.on("connectConsumerTransport", (event) => {
      onConnectConsumerTransport(event, socket);
    });

    socket.on("consume", (event) => {
      onConsume(event, socket);
    });

    socket.on("resume", (event) => {
      onResume(event, socket);
    });

    socket.on("close", () => {
      console.log("Connection closed");
    });

    socket.on("error", (e) => {
      console.log("Connection error", { e });
    });
  });

  const onProduce = async (event: any, socket: Socket, io: Server) => {
    const { kind, rtpParameters, transportId, producerId } = event;

    const producerTransport = producerTransports.get(String(transportId));

    if (producerTransport) {
      const producer = await producerTransport.transport.produce({
        kind,
        rtpParameters,
      });
      const resp = {
        id: producer.id,
      };

      producerTransport.producers.set(producer.id, producer);

      send(socket, "produced", resp);
      broadcast(io, "newProducer", { producerId: producer.id });
    }
  };

  const onRouterRtpCapabilities = (event: string, socket: Socket) => {
    send(socket, "routerCapabilities", mediasoupRouter.rtpCapabilities);
  };

  const onCreateProducerTransport = async (event: string, socket: Socket) => {
    try {
      const { transport, params } = await createWebrtcTransport(
        mediasoupRouter
      );

      const producerTransportInfo: ProducerTransportInfo = {
        transport,
        producers: new Map<string, Producer>(),
      };

      producerTransports.set(params.id, producerTransportInfo);

      send(socket, "producerTransportCreated", params);
    } catch (error) {
      console.error(error);
      send(socket, "error", error);
    }
  };

  const onCreateConsumerTransport = async (event: string, socket: Socket) => {
    try {
      const { transport, params } = await createWebrtcTransport(
        mediasoupRouter
      );

      const consumerTransportInfo: ConsumerTransportInfo = {
        transport,
        consumers: new Map<string, Consumer>(),
      };

      consumerTransports.set(params.id, consumerTransportInfo);

      send(socket, "subTransportCreated", params);
    } catch (error) {
      console.log("Error creating consumer transport", { error });
    }
  };

  const onConsume = async (event: any, socket: Socket) => {
    try {
      let producer: Producer | undefined;

      producerTransports.forEach((transportInfo) => {
        if (transportInfo.producers.has(event.producerId)) {
          producer = transportInfo.producers.get(event.producerId);
        }
      });

      let consumerTransport: Transport | undefined;
      consumerTransport = consumerTransports.get(event.transportId)?.transport;

      if (!consumerTransport) {
        send(
          socket,
          "error",
          `ConsumerTransport with ID ${event.transportId} not found.`
        );
        return;
      }

      if (!producer) {
        send(
          socket,
          "error",
          `Producer with ID ${event.producerId} not found.`
        );
        return;
      }

      const res = await createConsumer(
        event.transportId,
        producer,
        event.rtpCapabilities
      );
      send(socket, "subscribed", res);
    } catch (error) {
      console.error(error);
      send(socket, "error", error);
    }
  };

  const onResume = async (event: any, socket: Socket) => {
    let consumer: Consumer | undefined;

    consumerTransports.forEach((transportInfo) => {
      if (transportInfo.consumers.has(event.consumerId)) {
        consumer = transportInfo.consumers.get(event.consumerId);
      }
    });

    if (!consumer) {
      send(socket, "error", `Consumer with ID ${event.consumerId} not found.`);
      return;
    }

    await consumer.resume();
    send(socket, "resumed", "resumed");
  };

  const onConnectConsumerTransport = async (event: any, socket: Socket) => {
    let consumerTransport: Transport | undefined;
    consumerTransport = consumerTransports.get(event.transportId)?.transport;

    if (!consumerTransport) {
      send(socket, "error", `Consumer with ID ${event.transportId} not found.`);
      return;
    }

    await consumerTransport.connect({ dtlsParameters: event.dtlsParameters });
    send(socket, "subConnected", "consumer transport connected");
  };

  const onConnectProducerTransport = async (event: any, socket: Socket) => {
    let producerTransport: Transport | undefined;
    producerTransport = producerTransports.get(event.transportId)?.transport;

    if (!producerTransport) {
      send(socket, "error", `Consumer with ID ${event.transportId} not found.`);
      return;
    }

    await producerTransport.connect({ dtlsParameters: event.dtlsParameters });
    send(socket, "producerConnected", "producer connected");
  };

  const send = (socket: Socket, type: string, msg: any) => {
    console.log("SENT : ", JSON.stringify({ data: msg }, null, 2));

    socket.emit(type, msg);
  };

  const broadcast = (socket: Server, type: string, msg: any) => {
    console.log("BROADCASTED : ", JSON.stringify({ data: msg }, null, 2));
    io.emit(type, msg);
  };

  const createConsumer = async (
    consumerTransportId: string,
    producer: Producer,
    rtpCapabilities: RtpCapabilities
  ) => {
    if (
      !mediasoupRouter.canConsume({ producerId: producer.id, rtpCapabilities })
    ) {
      console.error("can not consume");
      return;
    }

    let consumerInfo: Consumer | undefined;

    try {
      // only used when going to resume
      const consumerTransport =
        consumerTransports.get(consumerTransportId)?.transport;
      if (!consumerTransport) return;

      const consumer = await consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === "video",
      });

      consumerInfo = consumer;

      consumerTransports
        .get(consumerTransportId)
        ?.consumers.set(consumer.id, consumer);
    } catch (error) {
      console.error("consume failed! ", error);
      return;
    }

    return {
      producerId: producer.id,
      id: consumerInfo.id,
      kind: consumerInfo.kind,
      rtpParameters: consumerInfo.rtpParameters,
      type: consumerInfo.type,
      producerPaused: consumerInfo.producerPaused,
    };
  };
};

export { WebsocketConnection };
