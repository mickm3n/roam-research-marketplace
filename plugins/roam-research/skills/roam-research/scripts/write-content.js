#!/usr/bin/env node
'use strict';

const readline = require('readline');
const crypto = require('crypto');
const { roamWrite } = require('./lib/http');
const { pageLocation, dailyNoteLocation, parentUidLocation, buildFlatActions, buildNestedActions } = require('./lib/batch-builder');

function showUsage() {
  console.log(`
Usage: write-content.js [options]

Write content (blocks) to a Roam Research page.

Options:
  --page <title>         Target page title (created automatically if it doesn't exist)
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
  write-content.js --today --content "Meeting notes from standup"
  write-content.js --page "Project Alpha" --content "TODO: Review design doc"
  echo -e "First\\nSecond\\nThird" | write-content.js --page "Meeting Notes" --stdin
  printf '%s\\n' 'Summary' '  **Decisions**' '    - Ship A' | write-content.js --today --nested
  write-content.js --parent "abc123xyz" --content "child block"
  write-content.js --update-block "abc123xyz" --content "updated content"

  # Batch via Roam's native batch-actions API (1 request)
  echo '[{"action":"update-block","block":{"uid":"abc123","string":"updated"}}]' | write-content.js --stdin
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    page: null, today: false, parent: null, updateBlock: null,
    content: null, stdin: false, nested: false, dryRun: false, help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help': case '-h': options.help = true; break;
      case '--page': case '-p': options.page = args[++i]; break;
      case '--today': case '-t': options.today = true; break;
      case '--parent': options.parent = args[++i]; break;
      case '--update-block': options.updateBlock = args[++i]; break;
      case '--content': case '-c': options.content = args[++i]; break;
      case '--stdin': options.stdin = true; break;
      case '--nested': options.nested = true; break;
      case '--dry-run': options.dryRun = true; break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
  return options;
}

function loadConfig() {
  const graphName = process.env.ROAM_GRAPH_NAME;
  const apiToken = process.env.ROAM_API_TOKEN;
  if (!graphName || !apiToken) {
    console.error('Error: ROAM_GRAPH_NAME and ROAM_API_TOKEN must be set');
    process.exit(1);
  }
  return { graphName, apiToken };
}

function getTodayDailyNoteDate() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${now.getFullYear()}`;
}

function getTodayRoamTitle() {
  const now = new Date();
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const day = now.getDate();
  const suffix = day >= 11 && day <= 13 ? 'th'
    : day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th';
  return `${months[now.getMonth()]} ${day}${suffix}, ${now.getFullYear()}`;
}

function generateUid() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 9);
}

async function readLinesFromStdin() {
  return new Promise((resolve) => {
    const lines = [];
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (line) => { const t = line.trimEnd(); if (t) lines.push(t); });
    rl.on('close', () => resolve(lines));
  });
}

async function readFlatLinesFromStdin() {
  return new Promise((resolve) => {
    const lines = [];
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (line) => { const t = line.trim(); if (t && !t.startsWith('#')) lines.push(t); });
    rl.on('close', () => resolve(lines));
  });
}

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

    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root.children;
}

function printTree(nodes, indent = 0) {
  for (const node of nodes) {
    console.log(`${'  '.repeat(indent)}${node.text}`);
    if (node.children.length) printTree(node.children, indent + 1);
  }
}

async function runBatchActions(config, actions, label) {
  const res = await roamWrite(config, { action: 'batch-actions', actions });
  console.log(`✓ ${label} (${actions.length} action${actions.length !== 1 ? 's' : ''})`);
  if (res && res['tempids-to-uids']) {
    console.log('tempids-to-uids:', JSON.stringify(res['tempids-to-uids']));
  }
  return res;
}

async function main() {
  const options = parseArgs();

  if (options.help) { showUsage(); process.exit(0); }

  // --- Batch JSON mode (raw batch-actions array via stdin, no target flag) ---
  if (options.stdin && !options.page && !options.today && !options.parent && !options.updateBlock) {
    const raw = await new Promise(resolve => {
      let buf = '';
      process.stdin.on('data', c => buf += c);
      process.stdin.on('end', () => resolve(buf.trim()));
    });
    let actions;
    try { actions = JSON.parse(raw); } catch {
      console.error('Error: JSON batch input is invalid'); process.exit(1);
    }
    if (!Array.isArray(actions)) {
      console.error('Error: batch input must be a JSON array of Roam write actions'); process.exit(1);
    }
    if (options.dryRun) {
      console.log('Dry run — batch-actions:');
      actions.forEach((a, i) => console.log(`  ${i + 1}. ${JSON.stringify(a)}`));
      process.exit(0);
    }
    const config = loadConfig();
    await runBatchActions(config, actions, 'batch-actions completed');
    return;
  }

  // --- Update block mode ---
  if (options.updateBlock) {
    if (!options.content) { console.error('Error: --update-block requires --content <text>'); process.exit(1); }
    if (options.dryRun) { console.log(`Dry run — update block ${options.updateBlock}: ${options.content}`); process.exit(0); }
    const config = loadConfig();
    await roamWrite(config, { action: 'update-block', block: { uid: options.updateBlock, string: options.content } });
    console.log(`✓ Updated block ${options.updateBlock}`);
    return;
  }

  // --- Parent mode (write as children of a specific block UID) ---
  if (options.parent) {
    const loc = parentUidLocation(options.parent);
    let actions;

    if (options.nested) {
      const rawLines = await readLinesFromStdin();
      const tree = parseIndentedLines(rawLines);
      if (tree.length === 0) { console.error('Error: No content provided via stdin.'); process.exit(1); }
      if (options.dryRun) { console.log(`Dry run — create under parent ${options.parent}:`); printTree(tree); process.exit(0); }
      actions = buildNestedActions(loc, tree);
    } else {
      const lines = options.content ? [options.content] : await readFlatLinesFromStdin();
      if (lines.length === 0) { console.error('Error: --parent requires --content or --stdin'); process.exit(1); }
      if (options.dryRun) { console.log(`Dry run — create under parent ${options.parent}:`); lines.forEach(l => console.log(`  - ${l}`)); process.exit(0); }
      actions = buildFlatActions(loc, lines);
    }

    const config = loadConfig();
    await runBatchActions(config, actions, `block(s) created under ${options.parent}`);
    return;
  }

  // Validate target
  if (!options.page && !options.today) {
    console.error('Error: Must specify one of --page, --today, --parent, or --update-block');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }
  if (options.page && options.today) {
    console.error('Error: Cannot use both --page and --today');
    process.exit(1);
  }

  const loc = options.today
    ? dailyNoteLocation(getTodayDailyNoteDate())
    : pageLocation(options.page);

  const displayTarget = options.today ? getTodayRoamTitle() : options.page;

  // --- Nested mode ---
  if (options.nested) {
    const rawLines = await readLinesFromStdin();
    const tree = parseIndentedLines(rawLines);
    if (tree.length === 0) { console.error('Error: No content provided via stdin.'); process.exit(1); }

    if (options.dryRun) {
      console.log(`Dry run — target: "${displayTarget}"`);
      printTree(tree);
      process.exit(0);
    }

    const config = loadConfig();
    const actions = buildNestedActions(loc, tree);
    console.log(`Writing to "${displayTarget}"...`);
    await runBatchActions(config, actions, `nested blocks written`);
    return;
  }

  // --- Flat mode ---
  const lines = options.content ? [options.content] : await readFlatLinesFromStdin();
  if (lines.length === 0) {
    console.error('Error: No content provided. Use --content <text> or --stdin.');
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(`Dry run — target: "${displayTarget}"`);
    lines.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
    process.exit(0);
  }

  const config = loadConfig();
  const actions = buildFlatActions(loc, lines);
  console.log(`Writing to "${displayTarget}"...`);
  await runBatchActions(config, actions, `${lines.length} block(s) written`);
}

main().catch(error => {
  console.error('\nFatal error:');
  if (error.statusCode) {
    console.error(`  HTTP ${error.statusCode}: ${error.body || error.message}`);
  } else {
    console.error(`  ${error.message || error}`);
  }
  process.exit(1);
});
