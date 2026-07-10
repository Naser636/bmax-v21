export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}
