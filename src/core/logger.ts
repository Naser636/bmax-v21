export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function logEvent(type: string, message: string): void {
  console.log(
    JSON.stringify({
      timestamp: Date.now(),
      type,
      message,
    })
  );
}
