#!/usr/bin/env node

const https = require('https');
const readline = require('readline');
const crypto = require('crypto');

// Show usage information
function showUsage() {
  console.log(`
Usage: write-content.js [options]

Write content (blocks) to a Roam Research page.

Options:
  --page <title>         Target page title to write to
  --today                Write to today's daily notes page
  --parent <uid>         Create new block(s) as children of a specific block UID
  --update-block <uid>   Update an existing block's content (use with --content)
  --content <text>       Content to write as a new block
  --stdin                Read content from stdin (one block per line)
  --nested               Use indented stdin input to create nested blocks (2 spaces per level)
  --dry-run              Preview without making API calls
  --help                 Show this help message

Environment Variables (required):
  ROAM_API_TOKEN       Your Roam Research API token (starts with roam-graph-token-)
  ROAM_GRAPH_NAME      Your Roam Research graph name

Examples:
  # Write a block to today's daily notes page
  write-content.js --today --content "Meeting notes from standup"

  # Write to a specific page
  write-content.js --page "Project Alpha" --content "TODO: Review design doc"

  # Write multiple flat blocks from stdin
  echo -e "First block\\nSecond block\\nThird block" | \\
    write-content.js --page "Meeting Notes" --stdin

  # Write nested blocks using indentation (2 spaces per level)
  printf '%s\\n' '[[日記]]' '  **今日完成**' '    - 做了A' | \\
    write-content.js --page "April 19th, 2026" --nested

  # Write blocks as children of a specific block UID
  write-content.js --parent "abc123xyz" --content "child block"

  # Update an existing block's content
  write-content.js --update-block "abc123xyz" --content "new content"

  # Batch update/create via JSON stdin (most efficient for multiple operations)
  echo '[
    {"action":"update","uid":"abc123","content":"Mon: 重訓、小穎 House"},
    {"action":"create","parent":"xyz456","content":"開發 AI 助理"}
  ]' | write-content.js --stdin

  # Dry run to preview
  write-content.js --today --content "Test content" --dry-run
`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    page: null,
    today: false,
    parent: null,
    updateBlock: null,
    content: null,
    stdin: false,
    nested: false,
    dryRun: false,
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
      case '--today':
      case '-t':
        options.today = true;
        break;
      case '--parent':
        options.parent = args[++i];
        break;
      case '--update-block':
        options.updateBlock = args[++i];
        break;
      case '--content':
      case '-c':
        options.content = args[++i];
        break;
      case '--stdin':
        options.stdin = true;
        break;
      case '--nested':
        options.nested = true;
        break;
      case '--dry-run':
        options.dryRun = true;
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

// Format today's date in Roam Research daily notes format
// Roam uses: "February 5th, 2026"
function getTodayRoamTitle() {
  const now = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const month = months[now.getMonth()];
  const day = now.getDate();
  const year = now.getFullYear();
  const suffix = getOrdinalSuffix(day);

  return `${month} ${day}${suffix}, ${year}`;
}

// Get ordinal suffix for a day number
function getOrdinalSuffix(day) {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// Read content lines from stdin (flat mode: trim lines)
async function readContentFromStdin() {
  return new Promise((resolve) => {
    const lines = [];
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        lines.push(trimmed);
      }
    });

    rl.on('close', () => resolve(lines));
  });
}

// Read raw lines from stdin preserving indentation (nested mode)
async function readRawLinesFromStdin() {
  return new Promise((resolve) => {
    const lines = [];
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (line) => { if (line.trimEnd()) lines.push(line.trimEnd()); });
    rl.on('close', () => resolve(lines));
  });
}

// Generate a 9-character Roam-compatible UID
function generateUid() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 9);
}

// Parse indented lines into a tree (2 spaces per level)
function parseIndentedLines(lines) {
  const root = { text: null, depth: -1, children: [], uid: null };
  const stack = [root];

  for (const line of lines) {
    if (!line.trim()) continue;
    const spaces = line.length - line.trimStart().length;
    const depth = Math.floor(spaces / 2);
    const raw = line.trimStart();
    const text = raw.startsWith('- ') ? raw.slice(2) : raw;
    const node = { text, depth, children: [], uid: generateUid() };

    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root.children;
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

// Query Roam Research for a page UID by title
async function queryPageUid(config, pageTitle) {
  const query = `[:find ?uid :where [?e :node/title "${pageTitle.replace(/"/g, '\\"')}"] [?e :block/uid ?uid]]`;
  const payload = JSON.stringify({ query });

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

  // Response is like { result: [["uid-string"]] } or { result: [] }
  if (response.data && response.data.result && response.data.result.length > 0) {
    return response.data.result[0][0];
  }
  return null;
}

// Create a page in Roam Research
async function createPage(config, pageTitle) {
  const payload = JSON.stringify({
    action: 'create-page',
    page: { title: pageTitle }
  });

  const options = {
    hostname: 'api.roamresearch.com',
    path: `/api/graph/${config.graphName}/write`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${config.apiToken}`,
      'Accept': 'application/json'
    },
    timeout: 30000
  };

  await makeHttpsRequest(options, payload);
}

// Update an existing block's string content
async function updateBlockContent(config, blockUid, content) {
  const payload = JSON.stringify({
    action: 'update-block',
    data: { block: { uid: blockUid, string: content } }
  });

  const options = {
    hostname: 'api.roamresearch.com',
    path: `/api/graph/${config.graphName}/write`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${config.apiToken}`,
      'Accept': 'application/json'
    },
    timeout: 30000
  };

  return await makeHttpsRequest(options, payload);
}

// Create a block under a parent (optionally with a pre-generated uid)
async function createBlock(config, parentUid, content, uid = null) {
  const block = uid ? { uid, string: content } : { string: content };
  const payload = JSON.stringify({
    action: 'create-block',
    location: {
      'parent-uid': parentUid,
      order: 'last'
    },
    block
  });

  const options = {
    hostname: 'api.roamresearch.com',
    path: `/api/graph/${config.graphName}/write`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${config.apiToken}`,
      'Accept': 'application/json'
    },
    timeout: 30000
  };

  return await makeHttpsRequest(options, payload);
}

// Recursively write a nested tree of blocks
async function writeTree(config, parentUid, nodes, stats) {
  for (const node of nodes) {
    try {
      await createBlock(config, parentUid, node.text, node.uid);
      stats.written++;
      process.stdout.write('.');
    } catch (error) {
      stats.failed++;
      process.stdout.write('x');
    }
    if (node.children.length > 0) {
      await writeTree(config, node.uid, node.children, stats);
    }
  }
}

// Print tree for dry-run preview
function printTree(nodes, indent = 0) {
  for (const node of nodes) {
    console.log(`${'  '.repeat(indent)}${node.text}`);
    if (node.children.length) printTree(node.children, indent + 1);
  }
}

// Ensure a page exists and return its UID
async function ensurePageAndGetUid(config, pageTitle) {
  // First, try to find the page
  let uid = await queryPageUid(config, pageTitle);

  if (uid) {
    return uid;
  }

  // Page doesn't exist, create it
  console.log(`  Page "${pageTitle}" does not exist, creating it...`);
  await createPage(config, pageTitle);

  // Query again to get the UID
  uid = await queryPageUid(config, pageTitle);

  if (!uid) {
    throw new Error(`Failed to get UID for page "${pageTitle}" after creation`);
  }

  return uid;
}

// Main function
async function main() {
  try {
    const options = parseArgs();

    // Show help if requested
    if (options.help) {
      showUsage();
      process.exit(0);
    }

    // --- batch mode ---
    if (options.stdin && !options.page && !options.today && !options.parent && !options.updateBlock) {
      // If stdin + no target, try to parse as JSON batch
      const raw = await new Promise(resolve => {
        let buf = '';
        process.stdin.on('data', c => buf += c);
        process.stdin.on('end', () => resolve(buf.trim()));
      });
      let ops;
      try { ops = JSON.parse(raw); } catch (e) {
        console.error('Error: JSON batch input is invalid');
        process.exit(1);
      }
      if (!Array.isArray(ops)) { console.error('Error: batch input must be a JSON array'); process.exit(1); }
      if (options.dryRun) {
        console.log('Dry run — batch operations:');
        ops.forEach((op, i) => console.log(`  ${i + 1}. ${JSON.stringify(op)}`));
        process.exit(0);
      }
      const config = loadConfig();
      let ok = 0, fail = 0;
      for (const op of ops) {
        try {
          if (op.action === 'update') {
            await updateBlockContent(config, op.uid, op.content);
          } else if (op.action === 'create') {
            await createBlock(config, op.parent, op.content);
          } else {
            throw new Error(`Unknown action: ${op.action}`);
          }
          ok++;
          process.stdout.write('.');
        } catch (e) {
          fail++;
          process.stdout.write('x');
        }
      }
      console.log(`\n✓ ${ok} succeeded, ✗ ${fail} failed`);
      if (fail > 0) process.exit(1);
      return;
    }

    // --- update-block mode ---
    if (options.updateBlock) {
      if (!options.content) {
        console.error('Error: --update-block requires --content <text>');
        process.exit(1);
      }
      if (options.dryRun) {
        console.log(`Dry run — update block ${options.updateBlock}: ${options.content}`);
        process.exit(0);
      }
      const config = loadConfig();
      await updateBlockContent(config, options.updateBlock, options.content);
      console.log(`✓ Updated block ${options.updateBlock}`);
      return;
    }

    // --- parent mode (create children under a block UID) ---
    if (options.parent) {
      let contentLines = [];
      if (options.stdin || options.nested) {
        const rawLines = options.nested
          ? await readRawLinesFromStdin()
          : await readContentFromStdin();
        contentLines = options.nested ? rawLines : rawLines;
      } else if (options.content) {
        contentLines = [options.content];
      } else {
        console.error('Error: --parent requires --content or --stdin');
        process.exit(1);
      }

      if (options.dryRun) {
        console.log(`Dry run — create under parent ${options.parent}:`);
        contentLines.forEach(l => console.log(`  - ${l}`));
        process.exit(0);
      }

      const config = loadConfig();
      if (options.nested) {
        const tree = parseIndentedLines(contentLines);
        const stats = { written: 0, failed: 0 };
        await writeTree(config, options.parent, tree, stats);
        console.log(`\n✓ Written: ${stats.written}, ✗ Failed: ${stats.failed}`);
      } else {
        for (const line of contentLines) {
          await createBlock(config, options.parent, line);
          process.stdout.write('.');
        }
        console.log(`\n✓ ${contentLines.length} block(s) created under ${options.parent}`);
      }
      return;
    }

    // Validate: must specify either --page or --today
    if (!options.page && !options.today) {
      console.error('Error: Must specify one of --page, --today, --parent, or --update-block');
      console.error('Run with --help for usage information.');
      process.exit(1);
    }

    if (options.page && options.today) {
      console.error('Error: Cannot use both --page and --today');
      process.exit(1);
    }

    // Determine target page title
    const pageTitle = options.today ? getTodayRoamTitle() : options.page;

    // --- Nested mode ---
    if (options.nested) {
      const rawLines = await readRawLinesFromStdin();
      const tree = parseIndentedLines(rawLines);

      if (tree.length === 0) {
        console.error('Error: No content provided via stdin.');
        process.exit(1);
      }

      if (options.dryRun) {
        console.log(`Dry run — target: "${pageTitle}"`);
        printTree(tree);
        process.exit(0);
      }

      const config = loadConfig();
      console.log(`Writing to Roam Research graph: ${config.graphName}`);
      console.log(`Target page: "${pageTitle}"\n`);

      const pageUid = await ensurePageAndGetUid(config, pageTitle);
      console.log(`  Page UID: ${pageUid}`);

      const stats = { written: 0, failed: 0 };
      await writeTree(config, pageUid, tree, stats);

      console.log('\n\nSummary:');
      console.log(`  ✓ Written: ${stats.written}`);
      console.log(`  ✗ Failed: ${stats.failed}`);
      if (stats.failed > 0) process.exit(1);
      return;
    }

    // --- Flat mode ---
    let contentLines = [];

    if (options.stdin) {
      contentLines = await readContentFromStdin();
    } else if (options.content) {
      contentLines = [options.content];
    }

    if (contentLines.length === 0) {
      console.error('Error: No content provided.');
      console.error('Use --content <text> or --stdin to provide content.');
      console.error('Run with --help for usage information.');
      process.exit(1);
    }

    // Dry run mode
    if (options.dryRun) {
      console.log('Dry run mode - no changes will be made');
      console.log(`Target page: "${pageTitle}"`);
      console.log(`Content blocks to write (${contentLines.length}):`);
      contentLines.forEach((line, i) => {
        console.log(`  ${i + 1}. ${line}`);
      });
      process.exit(0);
    }

    // Load config for actual API calls
    const config = loadConfig();

    console.log(`Writing to Roam Research graph: ${config.graphName}`);
    console.log(`Target page: "${pageTitle}"`);
    console.log('');

    // Ensure page exists and get its UID
    const pageUid = await ensurePageAndGetUid(config, pageTitle);
    console.log(`  Page UID: ${pageUid}`);

    // Write content blocks
    const results = {
      written: [],
      failed: []
    };

    for (const content of contentLines) {
      try {
        await createBlock(config, pageUid, content);
        results.written.push(content);
        process.stdout.write('.');
      } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        results.failed.push({ content, error: errorMsg });
        process.stdout.write('x');
      }
    }

    console.log('\n');
    console.log('Summary:');
    console.log(`  ✓ Written: ${results.written.length}`);
    console.log(`  ✗ Failed: ${results.failed.length}`);
    console.log('');

    if (results.written.length > 0) {
      console.log('Written blocks:');
      results.written.forEach((content, i) => {
        const preview = content.length > 80 ? content.substring(0, 77) + '...' : content;
        console.log(`  ${i + 1}. ${preview}`);
      });
      console.log('');
    }

    if (results.failed.length > 0) {
      console.log('Failed blocks:');
      results.failed.forEach(({ content, error }, i) => {
        const preview = content.length > 60 ? content.substring(0, 57) + '...' : content;
        console.log(`  ${i + 1}. ${preview}: ${error}`);
      });
      console.log('');
    }

    // Exit with error if any blocks failed
    if (results.failed.length > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('');
    console.error('✗ Fatal error:');
    console.error(error.message || error);
    process.exit(1);
  }
}

// Run main function
main();
