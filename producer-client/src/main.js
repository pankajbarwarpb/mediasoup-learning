import * as mediasoup from "mediasoup-client";
import { io } from "socket.io-client";

// let socket;
let btnCam,
  btnScreen,
  btnSub,
  textWebcam,
  textScreen,
  textPublish,
  textSubscribe,
  localVideo,
  remoteVideo,
  remoteStream,
  device,
  consumerTransport,
  isWebcam;

let remoteTransportId;

const socket = io("http://localhost:8000");

socket.on("connect", () => {
  console.log("Connected to the server with ID: ", socket.id);

  socket.emit("getRouterRtpCapabilities");

  socket.onAny((ev) => {
    console.log("onAny", { ev });
  });

  socket.on("routerCapabilities", (ev) => {
    console.log("routerCapabilities", { ev });
    onRouterCapabilities(ev);
  });

  socket.on("producerTransportCreated", (ev) => {
    console.log("producerTransportCreated", { ev });
    onProducerTransportCreated(ev);
  });

  socket.on("subTransportCreated", (ev) => {
    console.log("subTransportCreated", { ev });
    onSubTransportCreated(ev);
  });

  socket.on("subscribed", (ev) => {
    console.log("subscribed", { ev });
    onSubscribed(ev);
  });

  socket.on("resumed", (ev) => {
    console.log("resumed", { ev });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  btnCam = document.getElementById("btn_webcam");
  btnScreen = document.getElementById("btn_screen");
  btnSub = document.getElementById("btn_subscribe");
  textWebcam = document.getElementById("webcam_status");
  textScreen = document.getElementById("screen_status");
  textPublish = document.getElementById("text-publish");
  textWebcam = document.getElementById("text-webcam");
  textScreen = document.getElementById("text-screen");
  textSubscribe = document.getElementById("text-subscribe");
  remoteVideo = document.querySelector("video#remoteVideo");
  console.log({ textPublish });
  localVideo = document.getElementById("localVideo");

  // button event listeners
  btnCam.addEventListener("click", publish);
  btnScreen.addEventListener("click", publish);
  btnSub.addEventListener("click", subscribe);
});

const connect = () => {
  socket.onmessage = (event) => {
    const jsonValidation = IsJsonString(event.data);
    if (!jsonValidation) {
      console.log({ event });
      console.error("json error");
      return;
    }

    console.log("SOCKET MESSAGE: ", { event, data: JSON.parse(event.data) });

    const resp = JSON.parse(event.data);
    switch (resp.type) {
      case "routerCapabilities":
        onRouterCapabilities(resp);
        break;
      case "producerTransportCreated":
        onProducerTransportCreated(resp);
        break;
      case "subTransportCreated":
        onSubTransportCreated(resp);
        break;
      case "subConnected":
        console.log(resp);
        break;
      case "resumed":
        console.log(event.data);
        break;
      case "subscribed":
        onSubscribed(resp);
      default:
        break;
    }
  };
};

connect();

const onSubscribed = async (event) => {
  try {
    const { producerId, id, kind, rtpParameters } = event;

    let codecOptions = {};
    const consumer = await consumerTransport.consume({
      producerId,
      id,
      kind,
      rtpParameters,
      codecOptions,
    });

    const stream = new MediaStream();
    stream.addTrack(consumer.track);
    remoteStream = stream;
  } catch (error) {
    console.error("ERROR onsubscribed", { event, error });
  }
};

const onSubTransportCreated = (event) => {
  if (event.error) {
    console.error(event.error);
    return;
  }

  console.log("** onSubTransportCreated **", { event });
  const transport = device.createRecvTransport(event);
  transport.on("connect", ({ dtlsParameters }, callback) => {
    const msg = {
      type: "connectConsumerTransport",
      transportId: transport.id,
      dtlsParameters,
    };
    sendMessage(msg);

    socket.on("subConnected", callback);
  });

  transport.on("connectionstatechange", async (state) => {
    switch (state) {
      case "connecting":
        textSubscribe.innerHTML = "subscribing...";
        break;
      case "connected":
        remoteVideo.srcObject = remoteStream;
        const msg = {
          type: "resume",
        };
        sendMessage(msg);
        textSubscribe.innerHTML = "subscribed";
        break;
      case "failed":
        transport.close();
        textSubscribe.innerHTML = "failed!";
        btnSub.disabled = false;
        break;
      default:
        break;
    }
  });

  consumerTransport = transport;

  startConsuming(transport);
};

const startConsuming = async () => {
  const { rtpCapabilities } = device;
  const msg = {
    type: "consume",
    rtpCapabilities,
  };

  sendMessage(msg);
};

const onProducerTransportCreated = async (event) => {
  if (event.error) {
    console.log("producer transport create error: ", event.error);
    return;
  }

  console.log("Create send transport data : ", event, {
    id: event.id,
    dtlsParameters: event.dtlsParameters,
    iceCandidates: event.iceCandidates,
    iceParameters: event.iceParameters,
  });

  remoteTransportId = event.id;

  const transport = device.createSendTransport(event);

  transport.on("connect", async ({ dtlsParameters }, callback) => {
    const message = {
      type: "connectProducerTransport",
      dtlsParameters,
      transportId: remoteTransportId,
    };

    sendMessage(message);
    socket.on("producerConnected", () => {
      callback();
    });
  });

  // begin transport producer
  transport.on("produce", async ({ kind, rtpParameters }, callback) => {
    const message = {
      type: "produce",
      transportId: transport.id,
      kind,
      rtpParameters,
    };
    sendMessage(message);
    socket.addEventListener("published", (resp) => {
      callback(resp.data.id);
    });
  });
  // end transport producer

  // connection state change begin
  transport.on("connectionstatechange", (state) => {
    console.log({ textPublish, state });
    switch (state) {
      case "connecting":
        textPublish.innerHTML = "publishing......";
        break;
      case "connected":
        localVideo.srcObject = stream;
        textPublish.innerHTML = "published";
        break;
      case "failed":
        transport.close();
        textPublish.innerHTML = "failed";
        break;
      default:
        break;
    }
  });
  // connection state change end

  let stream;
  try {
    stream = await getUserMedia(transport, isWebcam);
    const track = stream.getVideoTracks()[0];
    const params = { track };

    producer = await transport.produce(params);
  } catch (error) {
    console.error(error);
    textPublish.innerHTML = "failed!";
  }
};

const onRouterCapabilities = (data) => {
  console.log("onRouterCapabilities", { data });
  loadDevice(data);
  btnCam.disabled = false;
  btnScreen.disabled = false;
};

const publish = (e) => {
  isWebcam = e.target.id === "btn_webcam";
  textPublish.innerHTML = isWebcam ? textWebcam : textScreen;
  btnScreen.disabled = true;
  btnCam.disabled = true;

  const message = {
    type: "createProducerTransport",
    forceTcp: false,
    rtpCapabilities: device.rtpCapabilities,
  };

  sendMessage(message);
};

const subscribe = () => {
  btnSub.disabled = true;
  const msg = {
    type: "createConsumerTransport",
    forceTcp: false,
  };

  sendMessage(msg);
};

const IsJsonString = (str) => {
  try {
    JSON.parse(str);
  } catch (error) {
    return false;
  }
  return true;
};

const loadDevice = async (routerRtpCapabilities) => {
  try {
    device = new mediasoup.Device();
    console.log("Mediasoup device created");
  } catch (error) {
    if (error.name === "UnsupportedError") {
      console.error("browser not supported !");
    }
  }

  console.log("device", device);

  await device.load({ routerRtpCapabilities });
};

const getUserMedia = async (transport, isWebcam) => {
  if (!device.canProduce("video")) {
    console.log("cannot produce video");
    return;
  }
  let stream;
  try {
    stream = isWebcam
      ? await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        })
      : await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (error) {
    console.log(error);
    throw error;
  }

  return stream;
};

const sendMessage = (msg) => {
  socket.emit(msg.type, { ...msg, type: undefined });
  try {
    console.log("SENT : ", {
      type: msg.type,
      data: { ...msg, type: undefined },
      msg,
    });
  } catch (error) {
    console.log("SENT : ", msg);
  }
};
