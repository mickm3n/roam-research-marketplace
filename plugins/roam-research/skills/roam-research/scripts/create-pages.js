#!/usr/bin/env node
'use strict';

const fs = require('fs');
const readline = require('readline');
const { roamWrite } = require('./lib/http');

function showUsage() {
  console.log(`
Usage: create-pages.js [options]

Options:
  --titles "Title 1,Title 2,Title 3"   Comma-separated list of page titles
  --file <path>                        Read page titles from file (one per line)
  --stdin                              Read page titles from stdin (one per line)
  --children-view-type <type>          Set children view type (bullet, numbered, document)
  --dry-run                            Show what would be created without making API calls
  --help                               Show this help message

Environment Variables (required):
  ROAM_API_TOKEN      Your Roam Research API token (starts with roam-graph-token-)
  ROAM_GRAPH_NAME     Your Roam Research graph name

Examples:
  create-pages.js --titles "Project A,Project B,Project C"
  create-pages.js --file pages.txt
  echo -e "Page 1\\nPage 2\\nPage 3" | create-pages.js --stdin
  echo -e "2026/January\\n2026/February" | create-pages.js --stdin
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { titles: [], file: null, stdin: false, childrenViewType: null, dryRun: false, help: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help': case '-h': options.help = true; break;
      case '--titles': options.titles = args[++i].split(',').map(t => t.trim()).filter(t => t); break;
      case '--file': case '-f': options.file = args[++i]; break;
      case '--stdin': options.stdin = true; break;
      case '--children-view-type': options.childrenViewType = args[++i]; break;
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

async function readLinesFromFile(filePath) {
  return new Promise((resolve, reject) => {
    const titles = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    rl.on('line', (line) => { const t = line.trim(); if (t && !t.startsWith('#')) titles.push(t); });
    rl.on('close', () => resolve(titles));
    rl.on('error', reject);
  });
}

async function readLinesFromStdin() {
  return new Promise((resolve) => {
    const titles = [];
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (line) => { const t = line.trim(); if (t && !t.startsWith('#')) titles.push(t); });
    rl.on('close', () => resolve(titles));
  });
}

async function getTitles(options) {
  if (options.stdin) return readLinesFromStdin();
  if (options.file) return readLinesFromFile(options.file);
  return options.titles;
}

async function main() {
  const options = parseArgs();
  if (options.help) { showUsage(); process.exit(0); }

  const allTitles = await getTitles(options);
  const titles = [...new Set(allTitles)];

  if (titles.length === 0) {
    console.error('Error: No page titles provided. Use --titles, --file, or --stdin.');
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(`Dry run — would create ${titles.length} pages:`);
    titles.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    if (options.childrenViewType) console.log(`  children-view-type: ${options.childrenViewType}`);
    process.exit(0);
  }

  const config = loadConfig();
  const actions = titles.map(title => {
    const page = { title };
    if (options.childrenViewType) page['children-view-type'] = options.childrenViewType;
    return { action: 'create-page', page };
  });

  console.log(`Creating ${titles.length} pages in graph: ${config.graphName}...`);

  try {
    const res = await roamWrite(config, { action: 'batch-actions', actions });
    console.log(`✓ ${titles.length} pages created`);
    if (res && res['tempids-to-uids']) {
      console.log('tempids-to-uids:', JSON.stringify(res['tempids-to-uids']));
    }
  } catch (error) {
    // batch-actions fails atomically; if some pages already exist the batch will fail.
    // Fall back to creating pages one by one to skip existing ones.
    if (error.statusCode === 400) {
      console.log('Batch failed (some pages may already exist), creating one by one...\n');
      const results = { created: [], skipped: [], failed: [] };

      for (const title of titles) {
        try {
          const page = { title };
          if (options.childrenViewType) page['children-view-type'] = options.childrenViewType;
          await roamWrite(config, { action: 'create-page', page });
          results.created.push(title);
          process.stdout.write('.');
        } catch (err) {
          let errData;
          try { errData = JSON.parse(err.body); } catch { errData = null; }
          if (errData && errData.message && errData.message.includes('already exists')) {
            results.skipped.push(title);
            process.stdout.write('s');
          } else {
            results.failed.push({ title, error: errData ? errData.message : (err.message || 'Unknown') });
            process.stdout.write('x');
          }
        }
      }

      console.log('\n');
      console.log(`  ✓ Created: ${results.created.length}`);
      console.log(`  ⊙ Skipped (already exist): ${results.skipped.length}`);
      console.log(`  ✗ Failed: ${results.failed.length}`);
      if (results.failed.length > 0) {
        results.failed.forEach(({ title, error }) => console.log(`    - ${title}: ${error}`));
        process.exit(1);
      }
    } else {
      throw error;
    }
  }
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
