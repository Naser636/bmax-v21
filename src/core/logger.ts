export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class NullLogger implements Logger {
  debug(_message: string): void {}

  info(_message: string): void {}

  warn(_message: string): void {}

  error(_message: string): void {}
}
