import http from 'http';

/**
 * Simple webhook echo server for testing
 * Run this: node dist/example/webhook-echo-server.js
 * Then run: node dist/example/webhook-test.js
 */

const PORT = 3000;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const timestamp = new Date(payload.timestamp || Date.now()).toISOString();

        console.log(`\n🪝 [${timestamp}] Webhook received!`);
        console.log(`   Event: ${payload.event}`);
        console.log(`   Job ID: ${payload.job.id}`);
        console.log(`   Status: ${payload.job.status}`);

        if (payload.error) {
          console.log(`   Error: ${payload.error.message}`);
        }

        if (payload.result) {
          const resultStr = JSON.stringify(payload.result);
          console.log(`   Result: ${resultStr.length > 50 ? resultStr.substring(0, 50) + '...' : resultStr}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error('Error parsing webhook:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🪝 Webhook Echo Server listening on http://localhost:${PORT}/webhook\n`);
});
