export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type Bindings = {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  ENVIRONMENT?: string;
  ALLOW_DEMO_AUTH?: string;
  SYNC_RATE_LIMITER?: RateLimiterBinding;
  DOWNLOAD_RATE_LIMITER?: RateLimiterBinding;
};
