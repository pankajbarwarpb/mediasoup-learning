import { useEffect, useRef, useState } from "react";
import { Log } from "./logger/Log";
import { validateJson } from "./utils/validators";
import { Device } from "mediasoup-client";

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [, setLocalStream] = useState<MediaStream | undefined>();
  const [, setWebsocket] = useState<WebSocket | undefined>();

  const device = useRef<Device | null>(null);

  useEffect(() => {
    device.current = new Device();
  }, []);

  // websocket connection
  useEffect(() => {
    const connectWs = () => {
      const wsUrl = import.meta.env.VITE_SIGNALING_SERVER_URL;
      Log({ wsUrl });
      const ws = new WebSocket(import.meta.env.VITE_SIGNALING_SERVER_URL || "");
      ws.onopen = () => {
        Log("Websocket connected");
        setWebsocket(ws);

        const msg = { type: "getRouterRtpCapabilities" };
        ws.send(JSON.stringify(msg));
      };

      ws.onmessage = (ev) => {
        const isValidJson = validateJson(ev);
        if (!isValidJson) {
          Log("Invalid ws message. Returning");
          return;
        }

        if (typeof ev !== "string") return;

        const data = JSON.parse(ev);
        const { type } = data;

        switch (type) {
          case "routerCapabilities":
            break;
          default:
            break;
        }
      };

      ws.onclose = () => {
        Log("Websocket closed");
      };

      ws.onerror = (e) => {
        Log("WebSocket error ", e);
      };
    };
    connectWs();
  }, []);

  // getting local stream
  useEffect(() => {
    const getLocalStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setLocalStream(stream);
      } catch (error) {
        console.error("Error accessing media device: ", error);
      }
    };
    getLocalStream();
  }, []);

  return (
    <div style={{ padding: "1rem" }}>
      <video style={{ height: "20rem" }} autoPlay muted ref={videoRef}></video>
      <button>Send Stream</button>
    </div>
  );
}

export default App;
