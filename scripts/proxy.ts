/**
 * Dev CORS proxy — lightweight Bun server that forwards requests to LLM APIs.
 * Only needed for web dev mode (Capacitor bypasses CORS natively).
 *
 * Usage: bun run proxy
 */

const PORT = 3001;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok');
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname !== '/proxy') {
      return new Response('Not found', { status: 404 });
    }

    const target = url.searchParams.get('url');
    if (!target) {
      return json({ error: 'Missing ?url= parameter' }, 400);
    }

    try {
      const targetUrl = new URL(target);

      // Only allow known LLM API hosts
      const allowed = [
        'api.openai.com',
        'api.anthropic.com',
        'models.inference.ai.azure.com',
        'localhost',
        '127.0.0.1',
      ];
      if (!allowed.some((h) => targetUrl.hostname === h || targetUrl.hostname.endsWith('.' + h))) {
        return json({ error: `Host no permitido: ${targetUrl.hostname}` }, 403);
      }

      // Forward request
      const body = req.method !== 'GET' ? await req.arrayBuffer() : undefined;
      const headers = new Headers();
      for (const [k, v] of req.headers.entries()) {
        if (['content-type', 'authorization', 'x-api-key', 'anthropic-version', 'anthropic-dangerous-direct-browser-access'].includes(k.toLowerCase())) {
          headers.set(k, v);
        }
      }

      const res = await fetch(target, {
        method: req.method,
        headers,
        body,
      });

      return new Response(res.body, {
        status: res.status,
        headers: {
          'content-type': res.headers.get('content-type') || 'application/json',
          ...corsHeaders(),
        },
      });
    } catch (err) {
      return json({ error: String(err) }, 502);
    }
  },
});

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  });
}

console.log(`CORS proxy en http://localhost:${PORT}/proxy?url=...`);
