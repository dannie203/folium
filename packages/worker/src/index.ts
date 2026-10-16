import { Hono } from 'hono';
import type { Bindings } from './bindings.ts';
import { corsMiddleware } from './middleware/cors.ts';
import { healthRoutes } from './routes/health.ts';
import { communityRoutes } from './routes/community.ts';
import { syncRoutes } from './routes/sync.ts';

// Re-export shared types & utilities for test suite and external consumers
export type { RateLimiterBinding, Bindings } from './bindings.ts';
export { verifyGoogleIdToken, parseExpiresIn, verifyGoogleAccessToken } from './auth/googleAuth.ts';
export { getClientIp, resetFallbackRateLimiter, checkRateLimit } from './middleware/rateLimit.ts';
export { isAllowedOrigin } from './middleware/cors.ts';
export { validateDownloadTargetUrl } from './security/downloadTarget.ts';
export { validateSyncPushPayload } from './sync/validateSyncPushPayload.ts';

const app = new Hono<{ Bindings: Bindings }>();

// 1. Strict CORS Allowlist & Preflight Middleware
app.use('*', corsMiddleware);

// 2. Mount Route Handlers
app.route('/', healthRoutes);
app.route('/', communityRoutes);
app.route('/', syncRoutes);

export { app };
export default app;
