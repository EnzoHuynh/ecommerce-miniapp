/** Error carrying the HTTP status so the UI can branch on 423 / 429 / 401 etc. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
