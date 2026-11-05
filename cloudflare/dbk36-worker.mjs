/**
 * Cloudflare perimeter for the EXISTING tested Next.js WhatsApp routes.
 * OpenNext officially supports a custom Worker that reuses its generated fetch handler.
 * The full application is bundled, but only the allowlisted WhatsApp routes can be requested.
 */
import openNextHandler from '../.open-next/worker.js';
import { routeDecision, cronTarget } from './dbk36-gateway-policy.mjs';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const unavailable = () => new Response('Not found', { status: 404, headers: noStore });

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const decision = routeDecision(request.method, pathname, env);
    if (decision === 'health') {
      return Response.json({ service: 'dbk36-whatsapp', status: 'available' }, { headers: noStore });
    }
    if (decision !== 'allow') return unavailable();
    try {
      return await openNextHandler.fetch(request, env, ctx);
    } catch {
      console.error('[DBK-36] Cloudflare webhook route unavailable');
      return Response.json({ error: 'Service temporarily unavailable' },
        { status: 503, headers: noStore });
    }
  },

  async scheduled(event, env, ctx) {
    const path = cronTarget(event.cron, env);
    if (!path) return; // All jobs disabled until production gates are explicitly enabled.
    const token = env.WHATSAPP_WORKER_SECRET?.trim();
    if (!token || token.length < 32) throw new Error('DBK-36 Cron secret is missing/too short');
    const request = new Request(`https://dbk36.internal${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    // Directly invoke the existing authenticated route. No public process/sync URL.
    const response = await openNextHandler.fetch(request, env, ctx);
    if (!response.ok) throw new Error(`DBK-36 Cron ${path} failed with HTTP ${response.status}`);
  },
};
