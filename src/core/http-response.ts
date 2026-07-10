export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
}
