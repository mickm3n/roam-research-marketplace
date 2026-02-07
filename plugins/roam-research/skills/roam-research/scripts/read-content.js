#!/usr/bin/env node

const https = require('https');

// Show usage information
function showUsage() {
  console.log(`
Usage: read-content.js [options]

Read content from Roam Research pages.

Options:
  --page <title>       Read the full block tree of a page
  --references <title> Find all blocks that reference (backlink) a page
  --modified-today     List pages with blocks modified today
  --json               Output results as JSON (for programmatic use)
  --help               Show this help message

Environment Variables (required):
  ROAM_API_TOKEN       Your Roam Research API token (starts with roam-graph-token-)
  ROAM_GRAPH_NAME      Your Roam Research graph name

Examples:
  # Read a page's content
  read-content.js --page "Project Alpha"

  # Read today's daily notes
  read-content.js --page "February 8th, 2026"

  # Find all references/backlinks to a page
  read-content.js --references "Project Alpha"

  # List pages modified today
  read-content.js --modified-today

  # Get JSON output for programmatic use
  read-content.js --page "Project Alpha" --json
`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    page: null,
    references: null,
    modifiedToday: false,
    json: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--page':
      case '-p':
        options.page = args[++i];
        break;
      case '--references':
      case '-r':
        options.references = args[++i];
        break;
      case '--modified-today':
        options.modifiedToday = true;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return options;
}

// Load configuration from environment variables
function loadConfig() {
  const graphName = process.env.ROAM_GRAPH_NAME;
  const apiToken = process.env.ROAM_API_TOKEN;

  if (!graphName || !apiToken) {
    console.error('Error: Required environment variables not set');
    console.error('');
    console.error('Please set the following environment variables:');
    console.error('  ROAM_GRAPH_NAME    Your Roam Research graph name');
    console.error('  ROAM_API_TOKEN     Your Roam Research API token');
    console.error('');
    console.error('Example:');
    console.error('  export ROAM_GRAPH_NAME="my-graph"');
    console.error('  export ROAM_API_TOKEN="roam-graph-token-xxx"');
    console.error('');
    process.exit(1);
  }

  return { graphName, apiToken };
}

// Make HTTPS request (shared helper)
function makeHttpsRequest(requestOptions, payload, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const makeRequest = (opts) => {
      const req = https.request(opts, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 308) {
          const redirectUrl = new URL(res.headers.location);
          const redirectOpts = {
            hostname: redirectUrl.hostname,
            port: redirectUrl.port || 443,
            path: redirectUrl.pathname + redirectUrl.search,
            method: opts.method,
            headers: opts.headers,
            timeout: timeout
          };

          const redirectReq = https.request(redirectOpts, (redirectRes) => {
            let data = '';
            redirectRes.on('data', (chunk) => { data += chunk; });
            redirectRes.on('end', () => {
              if (redirectRes.statusCode === 200) {
                resolve({ statusCode: redirectRes.statusCode, data: data ? JSON.parse(data) : {} });
              } else {
                reject({ statusCode: redirectRes.statusCode, message: data });
              }
            });
          });

          redirectReq.on('error', reject);
          redirectReq.on('timeout', () => { redirectReq.destroy(); reject(new Error('Request timeout')); });
          redirectReq.write(payload);
          redirectReq.end();
          return;
        }

        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ statusCode: res.statusCode, data: data ? JSON.parse(data) : {} });
          } else {
            reject({ statusCode: res.statusCode, message: data });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(payload);
      req.end();
    };

    makeRequest(requestOptions);
  });
}

// Run a Datalog query against the Roam API
async function runQuery(config, query, queryArgs) {
  const body = { query };
  if (queryArgs && queryArgs.length > 0) {
    body.args = queryArgs;
  }
  const payload = JSON.stringify(body);

  const options = {
    hostname: 'api.roamresearch.com',
    path: `/api/graph/${config.graphName}/q`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${config.apiToken}`,
      'Accept': 'application/json'
    },
    timeout: 30000
  };

  const response = await makeHttpsRequest(options, payload);

  if (response.data && response.data.result) {
    return response.data.result;
  }
  return [];
}

// Query page UID by title
async function queryPageUid(config, pageTitle) {
  const query = `[:find ?uid :where [?e :node/title "${pageTitle.replace(/"/g, '\\"')}"] [?e :block/uid ?uid]]`;
  const result = await runQuery(config, query);

  if (result.length > 0) {
    return result[0][0];
  }
  return null;
}

// Fetch children of a block/page by parent UID
async function fetchChildren(config, parentUid) {
  const query = `[:find ?childUid ?childString ?childOrder
 :in $ ?parentUid
 :where [?parent :block/uid ?parentUid]
        [?parent :block/children ?child]
        [?child :block/uid ?childUid]
        [?child :block/string ?childString]
        [?child :block/order ?childOrder]]`;

  const result = await runQuery(config, query, [parentUid]);

  // Sort by order and return as structured objects
  return result
    .map(([uid, string, order]) => ({ uid, string, order }))
    .sort((a, b) => a.order - b.order);
}

// Recursively build the block tree
async function buildBlockTree(config, parentUid, depth = 0, maxDepth = 10) {
  if (depth >= maxDepth) return [];

  const children = await fetchChildren(config, parentUid);
  const blocks = [];

  for (const child of children) {
    const subChildren = await buildBlockTree(config, child.uid, depth + 1, maxDepth);
    blocks.push({
      uid: child.uid,
      string: child.string,
      order: child.order,
      children: subChildren
    });
  }

  return blocks;
}

// Format block tree as indented text
function formatBlockTree(blocks, indent = 0) {
  let output = '';
  const prefix = '  '.repeat(indent) + '- ';

  for (const block of blocks) {
    output += prefix + block.string + '\n';
    if (block.children && block.children.length > 0) {
      output += formatBlockTree(block.children, indent + 1);
    }
  }

  return output;
}

// Feature 1: Read page content
async function readPage(config, pageTitle, jsonOutput) {
  const uid = await queryPageUid(config, pageTitle);

  if (!uid) {
    console.error(`Error: Page "${pageTitle}" not found.`);
    process.exit(1);
  }

  const blocks = await buildBlockTree(config, uid);

  if (jsonOutput) {
    console.log(JSON.stringify({ title: pageTitle, uid, blocks }, null, 2));
  } else {
    console.log(`Page: "${pageTitle}" (uid: ${uid})`);
    if (blocks.length === 0) {
      console.log('  (empty page)');
    } else {
      console.log(formatBlockTree(blocks));
    }
  }
}

// Feature 2: Read references/backlinks
async function readReferences(config, pageTitle, jsonOutput) {
  const uid = await queryPageUid(config, pageTitle);

  if (!uid) {
    console.error(`Error: Page "${pageTitle}" not found.`);
    process.exit(1);
  }

  // Try the ancestor-rule query first (finds nested references too)
  const ancestorRule = '[[(ancestor ?b ?a) [?a :block/children ?b]] [(ancestor ?b ?a) [?parent :block/children ?b] (ancestor ?parent ?a)]]';
  const ancestorQuery = `[:find ?block-str ?block-uid ?page-title
 :in $ ?ref-title %
 :where [?ref-page :node/title ?ref-title]
        [?block :block/refs ?ref-page]
        [?block :block/string ?block-str]
        [?block :block/uid ?block-uid]
        (ancestor ?block ?page)
        [?page :node/title ?page-title]]`;

  let result;
  try {
    result = await runQuery(config, ancestorQuery, [pageTitle, ancestorRule]);
  } catch (err) {
    // Fallback: direct children only query
    const simpleQuery = `[:find ?block-str ?block-uid ?page-title
 :in $ ?ref-title
 :where [?ref-page :node/title ?ref-title]
        [?block :block/refs ?ref-page]
        [?block :block/string ?block-str]
        [?block :block/uid ?block-uid]
        [?page :node/title ?page-title]
        [?page :block/children ?block]]`;

    result = await runQuery(config, simpleQuery, [pageTitle]);
  }

  // Group by source page
  const byPage = {};
  for (const [blockStr, blockUid, srcPageTitle] of result) {
    if (!byPage[srcPageTitle]) {
      byPage[srcPageTitle] = [];
    }
    byPage[srcPageTitle].push({ string: blockStr, uid: blockUid });
  }

  if (jsonOutput) {
    const references = Object.entries(byPage).map(([page, blocks]) => ({
      page,
      blocks: blocks.map(b => ({ string: b.string, uid: b.uid }))
    }));
    console.log(JSON.stringify({ referenceTo: pageTitle, uid, count: result.length, references }, null, 2));
  } else {
    console.log(`References to "${pageTitle}" (${result.length} found):`);
    console.log('');

    const pages = Object.keys(byPage).sort();
    if (pages.length === 0) {
      console.log('  (no references found)');
    } else {
      for (const page of pages) {
        console.log(`From "${page}":`);
        for (const block of byPage[page]) {
          const preview = block.string.length > 100
            ? block.string.substring(0, 97) + '...'
            : block.string;
          console.log(`  - ${preview} (uid: ${block.uid})`);
        }
        console.log('');
      }
    }
  }
}

// Feature 3: Pages modified today
async function readModifiedToday(config, jsonOutput) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTimestamp = startOfDay.getTime();

  // Try ancestor-rule query (catches block-level edits)
  const ancestorRule = '[[(ancestor ?b ?a) [?a :block/children ?b]] [(ancestor ?b ?a) [?parent :block/children ?b] (ancestor ?parent ?a)]]';
  const ancestorQuery = `[:find ?title (max ?time)
 :in $ ?start_of_day %
 :where [?page :node/title ?title]
        (ancestor ?block ?page)
        [?block :edit/time ?time]
        [(> ?time ?start_of_day)]]`;

  let result;
  try {
    result = await runQuery(config, ancestorQuery, [startTimestamp, ancestorRule]);
  } catch (err) {
    // Fallback: page-level edits only
    const simpleQuery = `[:find ?title (max ?time)
 :where [?page :node/title ?title]
        [?page :edit/time ?time]
        [(> ?time ${startTimestamp})]]`;

    result = await runQuery(config, simpleQuery);
  }

  // Sort by most recently edited
  result.sort((a, b) => (b[1] || 0) - (a[1] || 0));

  if (jsonOutput) {
    const pages = result.map(([title, lastEdited]) => ({
      title,
      lastEdited: lastEdited ? new Date(lastEdited).toISOString() : null
    }));
    console.log(JSON.stringify({ date: startOfDay.toISOString().split('T')[0], count: result.length, pages }, null, 2));
  } else {
    console.log(`Pages modified today (${result.length} found):`);
    if (result.length === 0) {
      console.log('  (none found)');
    } else {
      result.forEach(([title, lastEdited], i) => {
        const time = lastEdited ? new Date(lastEdited).toLocaleTimeString() : '';
        console.log(`  ${i + 1}. ${title}${time ? ' (last edit: ' + time + ')' : ''}`);
      });
    }
  }
}

// Main function
async function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      showUsage();
      process.exit(0);
    }

    // Validate: must specify exactly one mode
    const modes = [options.page, options.references, options.modifiedToday].filter(Boolean);
    if (modes.length === 0) {
      console.error('Error: Must specify one of --page, --references, or --modified-today');
      console.error('Run with --help for usage information.');
      process.exit(1);
    }
    if (modes.length > 1) {
      console.error('Error: Cannot combine --page, --references, and --modified-today');
      process.exit(1);
    }

    const config = loadConfig();

    if (options.page) {
      await readPage(config, options.page, options.json);
    } else if (options.references) {
      await readReferences(config, options.references, options.json);
    } else if (options.modifiedToday) {
      await readModifiedToday(config, options.json);
    }

  } catch (error) {
    console.error('');
    console.error('Fatal error:');
    if (error.statusCode) {
      console.error(`  HTTP ${error.statusCode}: ${error.message}`);
    } else {
      console.error(`  ${error.message || error}`);
    }
    process.exit(1);
  }
}

main();
