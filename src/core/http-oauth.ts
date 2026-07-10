export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}
