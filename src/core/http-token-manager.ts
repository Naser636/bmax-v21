import { OAuthToken } from "@/core/http-oauth";

export class TokenManager {
  private token?: OAuthToken;

  set(token: OAuthToken): void {
    this.token = token;
  }

  get(): OAuthToken | undefined {
    return this.token;
  }

  clear(): void {
    this.token = undefined;
  }
}
