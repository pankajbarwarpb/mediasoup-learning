type LogFunction = {
  (...args: unknown[]): void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
};

export const Log: LogFunction = ((...args: unknown[]) => {
  console.log(...args);
}) as LogFunction;

Log.error = (...args: unknown[]) => {
  console.error("[ERROR]", ...args);
};

Log.warn = (...args: unknown[]) => {
  console.warn("[WARN]", ...args);
};

Log.info = (...args: unknown[]) => {
  console.info("[INFO]", ...args);
};
