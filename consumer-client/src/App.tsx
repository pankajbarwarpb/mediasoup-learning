import { useCallback, useEffect, useRef } from "react";
import "./App.css";
import { io, Socket } from "socket.io-client";
import { Device } from "mediasoup-client";
import { Transport, type RtpCapabilities } from "mediasoup-client/types";
import VideoTile from "./VideoTile";
import { createRoot } from "react-dom/client";

function App() {
  // const [socket, setSocket] = useState<Socket | null>(null);
  const websocket = useRef<Socket | null>(null);
  const device = useRef<Device>(new Device());
  const consumerTransport = useRef<Transport | undefined>(undefined);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedIdsRef = useRef<Set<string>>(new Set());

  const createTransport = useCallback(() => {
    websocket.current?.emit("createConsumerTransport", { forceTcp: false });

    websocket.current?.on("subTransportCreated", (event) => {
      console.log("subTransportCreated", { event });
      if (device.current) {
        const transport = device.current.createRecvTransport(event);

        transport.on("connect", ({ dtlsParameters }, callback) => {
          websocket.current?.emit("connectConsumerTransport", {
            transportId: transport.id,
            dtlsParameters,
          });

          websocket.current?.on("subConnected", callback);
        });

        consumerTransport.current = transport;
      }

      websocket.current?.emit("requestList");
    });
  }, []);

  const onRouterCapabilites = useCallback(
    async (data: RtpCapabilities) => {
      if (!device.current?.loaded) {
        await device.current?.load({ routerRtpCapabilities: data });
        console.log("Device loaded");

        createTransport();
      }
    },
    [createTransport]
  );

  const handleProducersList = useCallback(
    (data: {
      producerTransports: Array<{
        producerTransportId: string;
        producerIds: Array<string>;
      }>;
    }) => {
      if (!websocket.current || !containerRef.current || !device.current) {
        console.log("********* RETURNING");
        return;
      }
      console.log("PRODUCERS list : ", {
        producerTransportIds: data.producerTransports,
      });

      if (device.current) {
        const { rtpCapabilities } = device.current;
        data.producerTransports.forEach(({ producerIds }) => {
          producerIds.forEach((producerId) => {
            if (!renderedIdsRef.current.has(producerId)) {
              renderedIdsRef.current.add(producerId);

              const tileDiv = document.createElement("div");
              tileDiv.id = `video-tile-${producerId}`;
              containerRef.current!.appendChild(tileDiv);

              const root = createRoot(tileDiv);
              root.render(
                <VideoTile
                  consumerTransport={consumerTransport.current}
                  producerId={producerId}
                  socket={websocket.current}
                  rtpCapabilities={rtpCapabilities}
                />
              );
            }
          });
        });
      } else {
        console.log("NO DEVICE");
      }
    },
    []
  );

  const onConnect = useCallback(
    (ws: Socket) => {
      // setSocket(ws);
      websocket.current = ws;
      console.log("ws connected");
      ws.emit("getRouterRtpCapabilities");

      ws.onAny((event) => {
        console.log("onAny", { event });
      });

      ws.on("routerCapabilities", onRouterCapabilites);
      ws.on("producersList", (event) => {
        handleProducersList(event);
      });

      ws.on("error", (error) => {
        console.log("Got SERVER ERROR * *********** * : ", { error });
      });
    },
    [onRouterCapabilites, handleProducersList]
  );

  useEffect(() => {
    const ws = io("http://localhost:8000");

    ws.on("connect", () => onConnect(ws));
    ws.on("disconnect", (reason) => console.log("Disconnected:", reason));
    ws.on("connect_error", (err) =>
      console.error("WebSocket error:", err.message)
    );

    return () => {
      ws.disconnect();
    };
  }, [onConnect]);

  return <div ref={containerRef} className="video-container" />;
}

export default App;
