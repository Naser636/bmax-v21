import { BOAMP_BASE_URL } from "@/core/boamp-config";

export function buildBoampUrl(query: string): string {
  return `${BOAMP_BASE_URL}/recherche?text=${encodeURIComponent(query)}`;
}
