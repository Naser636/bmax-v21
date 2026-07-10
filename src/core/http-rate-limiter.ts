export class HttpRateLimiter {
  constructor(
    public readonly requestsPerMinute: number
  ) {}

  canExecute(): boolean {
    return this.requestsPerMinute > 0;
  }
}
