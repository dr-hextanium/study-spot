/** Error body sent to clients. `error` is a stable code from the survey contract. */
export type ErrorBody = { error: string } & Record<string, unknown>;

/** Thrown by handlers and the write pipeline; the app error handler sends it as is. */
export class HttpError extends Error {
  override name = "HttpError";
  readonly status: number;
  readonly body: ErrorBody;

  constructor(status: number, body: ErrorBody) {
    super(`${status} ${body.error}`);
    this.status = status;
    this.body = body;
  }
}
