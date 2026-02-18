/**
 * Worker Health Check Server
 * Simple HTTP server for worker healthcheck endpoint
 * Used when running worker as a separate process
 */

import { createServer } from 'http';

const PORT = process.env.WORKER_HEALTH_PORT || 3001;

const server = createServer((req, res) => {
  if (req.url === '/api/health/worker' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'reconciliation-worker',
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Only start server if not already running (avoid duplicate listeners)
if (!(global as any).workerHealthServer) {
  server.listen(PORT, () => {
    console.log(`[Worker Health] Server running on port ${PORT}`);
  });
  (global as any).workerHealthServer = server;
}

