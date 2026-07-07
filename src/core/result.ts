import { ErrorCode } from "./errors";

export type Result<T> =
  | {
      success: true;
      value: T;
    }
  | {
      success: false;
      error: ErrorCode;
      message: string;
    };
