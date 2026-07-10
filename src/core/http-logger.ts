export class HttpLogger {
  info(message: string): void {
    console.log(`[HTTP] ${message}`);
  }

  error(message: string): void {
    console.error(`[HTTP] ${message}`);
  }
}
