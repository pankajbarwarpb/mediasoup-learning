import type { RtpCapabilities, Transport } from "mediasoup-client/types";
import type React from "react";
import { useEffect } from "react";
import { Socket } from "socket.io-client";

type VideoTileProps = {
  consumerTransport: Transport | undefined;
  producerId: string;
  socket: Socket | null;
  rtpCapabilities: RtpCapabilities;
};

const VideoTile: React.FC<VideoTileProps> = ({
  consumerTransport,
  producerId,
  socket,
  rtpCapabilities,
}) => {
  console.log({ consumerTransport, producerId, socket, rtpCapabilities });
  useEffect(() => {
    socket?.emit("consume", {
      rtpCapabilities,
      producerId,
      transportId: consumerTransport?.id,
    });

    socket?.on("subscribed", async (event) => {
      const { producerId, id, kind, rtpParameters } = event;

      if (consumerTransport) {
        const consumer = await consumerTransport.consume({
          producerId,
          id,
          kind,
          rtpParameters,
        });

        const stream = new MediaStream();
        stream.addTrack(consumer.track);

        // Create a new video element dynamically
        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.controls = true;
        document.body.appendChild(video); // Or append to a container
      }
    });
  }, [socket, rtpCapabilities, producerId, consumerTransport]);

  return (
    <div>
      {producerId}
      <video style={{ height: "400px" }}></video>
    </div>
  );
};

export default VideoTile;
