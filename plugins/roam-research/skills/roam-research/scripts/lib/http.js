'use strict';
const https = require('https');

function request(path, body, apiToken, timeout = 30000) {
  const payload = JSON.stringify(body);
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-Authorization': `Bearer ${apiToken}`,
    'Accept': 'application/json'
  };

  return new Promise((resolve, reject) => {
    const send = (opts) => {
      const req = https.request(opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 308) {
          const redirectUrl = new URL(res.headers.location);
          send({
            hostname: redirectUrl.hostname,
            port: redirectUrl.port || 443,
            path: redirectUrl.pathname + redirectUrl.search,
            method: 'POST',
            headers,
            timeout
          });
          return;
        }

        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data ? JSON.parse(data) : {});
          } else {
            const err = new Error(`HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.body = data;
            reject(err);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(payload);
      req.end();
    };

    send({
      hostname: 'api.roamresearch.com',
      path,
      method: 'POST',
      headers,
      timeout
    });
  });
}

function roamQuery(config, query, args = []) {
  const body = args.length > 0 ? { query, args } : { query };
  return request(`/api/graph/${config.graphName}/q`, body, config.apiToken)
    .then(data => (data && data.result) ? data.result : []);
}

function roamPull(config, eid, selector) {
  return request(`/api/graph/${config.graphName}/pull`, { eid, selector }, config.apiToken)
    .then(data => (data && data.result) ? data.result : null);
}

function roamWrite(config, action) {
  return request(`/api/graph/${config.graphName}/write`, action, config.apiToken);
}

module.exports = { roamQuery, roamPull, roamWrite };
