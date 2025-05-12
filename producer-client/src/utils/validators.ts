import { Log } from "../logger/Log";

export const validateJson = (input: unknown): boolean => {
  if (typeof input !== "string") {
    Log.warn("Invalid input type: expected a string.", typeof input, input);
    return false;
  }

  try {
    JSON.parse(input);
    return true;
  } catch (e) {
    Log.error("Invalid JSON:", e);
    return false;
  }
};
