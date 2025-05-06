import WebSocket from "ws";
import { createWorker } from "./worker";
import { Router, Worker } from "mediasoup/node/lib/types";
import { config } from "../config";

let mediasoupRouter: Router;

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

  const onRouterRtpCapabilities = (event: object, ws: WebSocket) => {
    send(ws, "routerCapabilities", mediasoupRouter.rtpCapabilities);
    console.log({ routerCapabilities: JSON.stringify(mediasoupRouter.rtpCapabilities, null, 2) });
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
};

export { WebsocketConnection };
