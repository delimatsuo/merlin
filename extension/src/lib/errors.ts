import { ErrorType } from "./types";

export class AutoApplyFlowError extends Error {
  readonly type: ErrorType;

  constructor(type: ErrorType, message: string) {
    super(message);
    this.name = "AutoApplyFlowError";
    this.type = type;
  }
}

export function isAutoApplyFlowError(error: unknown): error is AutoApplyFlowError {
  return error instanceof AutoApplyFlowError;
}
