export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg: string, code = "bad_request") => new AppError(400, code, msg);
export const unauthorized = (msg = "Sign in to continue") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "You do not have access to this resource", code = "forbidden") => new AppError(403, code, msg);
export const notFound = (msg = "Not found") => new AppError(404, "not_found", msg);
export const conflict = (msg: string, code = "conflict") => new AppError(409, code, msg);
