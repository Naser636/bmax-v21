import { HttpQuery, buildQuery } from "@/core/http-query";

export function buildUrl(
  base: string,
  query?: HttpQuery
): string {
  if (!query) return base;

  return `${base}?${buildQuery(query)}`;
}
