import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { io, Socket } from "socket.io-client";
import { Device } from "mediasoup-client";
import type { RtpCapabilities } from "mediasoup-client/types";

function App() {
  const [, setSocket] = useState<Socket | null>(null);

  const device = useRef<Device | null>(null);

  useEffect(() => {
    device.current = new Device();
  }, []);

  const onRouterCapabilites = useCallback(async (data: RtpCapabilities) => {
    console.log({ data });
    if (!device.current?.loaded) {
      await device.current?.load({
        routerRtpCapabilities: data,
      });
    }
  }, []);

  const onConnect = useCallback(
    (ws: Socket) => {
      setSocket(ws);
      console.log("Connected to ws server: ", ws.id);
      ws.emit("getRouterRtpCapabilities");

      ws.on("routerCapabilities", onRouterCapabilites);
    },
    [onRouterCapabilites]
  );

  useEffect(() => {
    const ws = io("http://localhost:8000");

    ws.onAny((event) => {
      console.log("onAny", { event });
    });

    ws.on("connect", () => {
      onConnect(ws);
    });

    ws.on("disconnect", (reason) => {
      console.log("Disconnected from ws server: ", reason);
    });

    ws.on("connect_error", (err) => {
      console.error("WebSocket connection error:", err.message);
    });

    return () => {
      ws.disconnect();
    };
  }, [onConnect]);

  return <div></div>;
}

export default App;
