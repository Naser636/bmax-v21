export type HttpQuery = Record<
  string,
  string | number | boolean
>;

export function buildQuery(query: HttpQuery): string {
  return new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)])
  ).toString();
}
