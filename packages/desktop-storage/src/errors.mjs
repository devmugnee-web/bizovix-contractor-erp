export class DesktopStoreError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "DesktopStoreError";
    this.code = code;
  }
}

export function fail(code, message) { throw new DesktopStoreError(code, message); }
