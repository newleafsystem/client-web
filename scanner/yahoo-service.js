#!/usr/bin/env node
'use strict';

const http = require('http');
const {
  getOptionChain,
  getOptionExpirations
} = require('./lib/yahooFinance');

const PORT = Number(process.env.PORT || 5300);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      status: 'healthy',
      service: 'NewLeaf Yahoo Options Service',
      runtime: 'node',
      timestamp: new Date().toISOString()
    });
    return;
  }

  const match = url.pathname.match(/^\/api\/options\/([^/]+)(?:\/([^/]+))?$/);
  if (req.method === 'GET' && match) {
    const symbol = decodeURIComponent(match[1]);
    const expiry = match[2] ? decodeURIComponent(match[2]) : '';

    try {
      const payload = expiry
        ? await getOptionChain(symbol, expiry)
        : await getOptionExpirations(symbol);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`NewLeaf Yahoo Options Service (Node) -> http://localhost:${PORT}`);
});
