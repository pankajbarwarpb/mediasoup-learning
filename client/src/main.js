import * as mediasoup from "mediasoup-client";

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
  producer,
  consumeTransport,
  userId,
  isWebcam,
  produceCallback,
  produceErrback,
  consumerCallback,
  consumerErrback;
const websocketURL = "ws://127.0.0.0:8000/ws";

let socket;

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
  socket = new WebSocket(websocketURL);
  socket.onopen = () => {
    // start our socket request
    console.log("Socket opened");

    const msg = {
      type: "getRouterRtpCapabilities",
    };
    const resp = JSON.stringify(msg);
    socket.send(resp);
  };

  socket.onclose = () => {
    console.log("Socket closed");
  };

  socket.onerror = (e) => {
    console.log("Socket connection error", { e });
  };

  socket.onmessage = (event) => {
    const jsonValidation = IsJsonString(event.data);
    if (!jsonValidation) {
      console.log({ event });
      console.error("json error");
      return;
    }

    console.log("SOCKET MESSAGE: ", { event });

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
        onSubTransportCreated(resp);
        break;
      case "resumed":
        console.log(event.data);
        break;
      default:
        break;
    }
  };
};

connect();

const onSubTransportCreated = (event) => {
  if (event.error) {
    console.error(event.error);
    return;
  }

  const transport = device.createRecvTransport(event.data);
  transport.on("connect", ({ dtlsParameters }, callback, errback) => {
    const msg = {
      type: "connectConsumerTransport",
      transportId: transport.id,
      dtlsParameters,
    };
    const message = JSON.stringify(msg);
    socket.send(message);

    socket.addEventListener("message", (event) => {
      const jsonValidation = IsJsonString(event.data);
      if (!jsonValidation) {
        console.log({ event });
        console.error("json error");
        return;
      }

      const resp = JSON.parse(event.data);
      if (resp.type === "subConnected") {
        console.log("consumer transport connected!!!");
        callback();
      }
    });
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
        const message = JSON.stringify(msg);
        socket.send(message);
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

  const stream = consumer(transport);
};

const consumer = async (transport) => {
  const { rtpCapabilities } = device;
  const msg = {
    type: "consume",
    rtpCapabilities,
  };

  const message = JSON.stringify(msg);
  socket.send(message);
};

const onProducerTransportCreated = async (event) => {
  if (event.error) {
    console.log("producer transport create error: ", event.error);
    return;
  }

  console.log("Create send transport data : ", event.data, {
    id: event.data.id,
    dtlsParameters: event.data.dtlsParameters,
    iceCandidates: event.data.iceCandidates,
    iceParameters: event.data.iceParameters,
  });

  const transport = device.createSendTransport(event.data);

  transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
    const message = {
      type: "connectProducerTransport",
      dtlsParameters,
    };

    const resp = JSON.stringify(message);
    socket.send(resp);
    socket.addEventListener("message", (event) => {
      const jsonValidation = IsJsonString(event.data);
      if (!jsonValidation) {
        console.log({ event });
        console.error("json error");
        return;
      }

      const resp = JSON.parse(event.data);
      if (resp.type === "producerConnected") {
        console.log("got producerConnected!!!");
        callback();
      }
    });
  });

  // begin transport producer
  transport.on(
    "produce",
    async ({ kind, rtpParameters }, callback, errback) => {
      const message = {
        type: "produce",
        transportId: transport.id,
        kind,
        rtpParameters,
      };
      const resp = JSON.stringify(message);
      socket.send(resp);
      socket.addEventListener("published", (resp) => {
        callback(resp.data.id);
      });
    }
  );
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

const onRouterCapabilities = (resp) => {
  loadDevice(resp.data);
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

  const resp = JSON.stringify(message);
  socket.send(resp);
};

const subscribe = () => {
  btnSub.disabled = true;
  const msg = {
    type: "createConsumerTransport",
    forceTcp: false,
  };

  const message = JSON.stringify(msg);
  socket.send(message);
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
