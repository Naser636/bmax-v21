export function parseJson<T>(json: string): T {
  return JSON.parse(json) as T;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}
