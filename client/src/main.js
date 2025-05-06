import * as mediasoup from "mediasoup-client";

// let socket;
let btnCam,
  btnScreen,
  btnSub,
  textWebcam,
  textScreen,
  localVideo,
  remoteVideo,
  remoteStream,
  producer,
  consumeTransport,
  userId,
  isWebcam,
  produceCallback,
  produceErrback,
  consumerCallback,
  consumerErrback;
const websocketURL = "ws://127.0.0.0:8000/ws";

let socket, device;

document.addEventListener("DOMContentLoaded", () => {
  btnCam = document.getElementById("btn_webcam");
  btnScreen = document.getElementById("btn_screen");
  btnSub = document.getElementById("btn_subscribe");
  textWebcam = document.getElementById("webcam_status");
  textScreen = document.getElementById("screen_status");

  // button event listeners
  btnCam.addEventListener("click", publish);
  btnScreen.addEventListener("click", publish);
  btnSub.addEventListener("click", subscribe);
});

const connect = () => {
  const socket = new WebSocket(websocketURL); // remove const
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

    const resp = JSON.parse(event.data);
    switch (resp.type) {
      case "routerCapabilities":
        onRouterCapabilities(resp);
        break;

      default:
        break;
    }
  };

  const onRouterCapabilities = (resp) => {
    loadDevice(resp.data);
    btnCam.disabled = false;
    btnScreen.disabled = false;
  };

  const publish = (e) => {
    isWebcam = e.target.id === "btn_webcam";
    textPublish = isWebcam ? textWebcam : textScreen;
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
    } catch (error) {
      if (error.name === "UnsupportedError") {
        console.log("browser not supported !");
      }
    }

    await device.load({ routerRtpCapabilities });
  };
};

connect();
