import { HttpClient } from "@/contracts/http-client";

export class HttpService {
  constructor(
    private readonly client: HttpClient
  ) {}

  get clientInstance(): HttpClient {
    return this.client;
  }
}
