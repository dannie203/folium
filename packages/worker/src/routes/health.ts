import { Hono } from 'hono';
import type { Bindings } from '../bindings.ts';

export const healthRoutes = new Hono<{ Bindings: Bindings }>();

// ------------------------------------------------------------------------------
// Health Check
// ------------------------------------------------------------------------------
healthRoutes.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'folium-sync-worker',
    timestamp: Date.now(),
  });
});
