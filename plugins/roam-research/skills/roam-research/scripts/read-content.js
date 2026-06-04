#!/usr/bin/env node
'use strict';

const { roamQuery, roamPull } = require('./lib/http');
const { PULL_SELECTOR, parsePullResult, formatBlockTree } = require('./lib/pull-parser');

function showUsage() {
  console.log(`
Usage: read-content.js [options]

Read content from Roam Research pages.

Options:
  --page <title>       Read the full block tree of a page
  --block <uid>        Read a specific block and its children by UID
  --find <text>        Search for blocks containing text within a page (requires --page)
  --uid-only           Output only UIDs, one per line (requires --find)
  --references <title> Find all blocks that reference (backlink) a page
                       Accepts "#Tag/Movie" or "Tag/Movie" — strips leading # automatically
  --search <text>      Search for blocks containing text across all pages
  --modified-today     List pages with blocks modified today
  --json               Output results as JSON (for programmatic use)
  --help               Show this help message

Environment Variables (required):
  ROAM_API_TOKEN       Your Roam Research API token (starts with roam-graph-token-)
  ROAM_GRAPH_NAME      Your Roam Research graph name

Examples:
  read-content.js --page "Project Alpha"
  read-content.js --block "HdQFZpcYd"
  read-content.js --page "2026/April" --find "Review"
  read-content.js --page "2026/April" --find "Review" --uid-only
  read-content.js --page "April 20th, 2026"
  read-content.js --references "Tag/Movie"
  read-content.js --references "#Tag/Movie"
  read-content.js --search "後室"
  read-content.js --modified-today
  read-content.js --page "Project Alpha" --json
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { page: null, block: null, find: null, uidOnly: false, references: null, search: null, modifiedToday: false, json: false, help: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help': case '-h': options.help = true; break;
      case '--page': case '-p': options.page = args[++i]; break;
      case '--block': case '-b': options.block = args[++i]; break;
      case '--find': case '-f': options.find = args[++i]; break;
      case '--uid-only': options.uidOnly = true; break;
      case '--references': case '-r': options.references = args[++i]; break;
      case '--search': case '-s': options.search = args[++i]; break;
      case '--modified-today': options.modifiedToday = true; break;
      case '--json': options.json = true; break;
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

// Resolve ((uid)) block references in parallel
async function resolveBlockRefs(config, str) {
  const matches = [...str.matchAll(/\(\(([a-zA-Z0-9_-]+)\)\)/g)];
  if (matches.length === 0) return str;

  const uids = matches.map(m => m[1]);
  const results = await Promise.all(
    uids.map(uid => roamQuery(config,
      `[:find ?s :in $ ?uid :where [?b :block/uid ?uid] [?b :block/string ?s]]`,
      [uid]
    ))
  );

  let resolved = str;
  for (let i = 0; i < matches.length; i++) {
    const content = results[i].length > 0 ? results[i][0][0] : null;
    if (content) resolved = resolved.replace(matches[i][0], `[${content}]`);
  }
  return resolved;
}

// Recursively resolve refs across a whole block tree (in parallel per block)
async function resolveTreeRefs(config, blocks) {
  return Promise.all(blocks.map(async block => ({
    ...block,
    string: await resolveBlockRefs(config, block.string),
    children: block.children.length > 0 ? await resolveTreeRefs(config, block.children) : []
  })));
}

function searchBlocks(blocks, text, results = []) {
  const lower = text.toLowerCase();
  for (const block of blocks) {
    if (block.string.toLowerCase().includes(lower)) {
      results.push({ uid: block.uid, string: block.string });
    }
    if (block.children.length > 0) searchBlocks(block.children, text, results);
  }
  return results;
}

async function findInPage(config, pageTitle, findText, uidOnly, jsonOutput) {
  const eid = `[:node/title "${pageTitle.replace(/"/g, '\\"')}"]`;
  const raw = await roamPull(config, eid, PULL_SELECTOR);

  if (!raw) {
    console.error(`Error: Page "${pageTitle}" not found.`);
    process.exit(1);
  }

  const page = parsePullResult(raw);
  const matches = searchBlocks(page.children, findText);

  if (uidOnly) {
    matches.forEach(m => console.log(m.uid));
  } else if (jsonOutput) {
    console.log(JSON.stringify({ page: pageTitle, find: findText, matches }, null, 2));
  } else {
    console.log(`Blocks matching "${findText}" in "${pageTitle}" (${matches.length} found):`);
    if (matches.length === 0) {
      console.log('  (no matches)');
    } else {
      matches.forEach(m => {
        const preview = m.string.length > 80 ? m.string.substring(0, 77) + '...' : m.string;
        console.log(`  [${m.uid}] ${preview}`);
      });
    }
  }
}

async function readPage(config, pageTitle, jsonOutput, resolveRefs) {
  const eid = `[:node/title "${pageTitle.replace(/"/g, '\\"')}"]`;
  const raw = await roamPull(config, eid, PULL_SELECTOR);

  if (!raw) {
    console.error(`Error: Page "${pageTitle}" not found.`);
    process.exit(1);
  }

  const page = parsePullResult(raw);
  let blocks = page.children;

  if (resolveRefs && blocks.length > 0) {
    blocks = await resolveTreeRefs(config, blocks);
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ title: pageTitle, uid: page.uid, blocks }, null, 2));
  } else {
    console.log(`Page: "${pageTitle}" (uid: ${page.uid})`);
    if (blocks.length === 0) {
      console.log('  (empty page)');
    } else {
      process.stdout.write(formatBlockTree(blocks));
    }
  }
}

async function readBlock(config, blockUid, jsonOutput, resolveRefs) {
  const eid = `[:block/uid "${blockUid}"]`;
  const raw = await roamPull(config, eid, PULL_SELECTOR);

  if (!raw) {
    console.error(`Error: Block "${blockUid}" not found.`);
    process.exit(1);
  }

  const block = parsePullResult(raw);
  let str = block.string;
  let children = block.children;

  if (resolveRefs) {
    str = await resolveBlockRefs(config, str);
    if (children.length > 0) children = await resolveTreeRefs(config, children);
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ uid: block.uid, string: str, children }, null, 2));
  } else {
    console.log(`Block (uid: ${blockUid}):`);
    console.log(`- ${str}`);
    if (children.length > 0) process.stdout.write(formatBlockTree(children, 1));
  }
}

async function searchAllPages(config, searchText, jsonOutput) {
  const ancestorRule = '[[(ancestor ?b ?a) [?a :block/children ?b]] [(ancestor ?b ?a) [?parent :block/children ?b] (ancestor ?parent ?a)]]';
  const ancestorQuery = `[:find ?block-str ?block-uid ?page-title
 :in $ ?search-text %
 :where [?block :block/string ?block-str]
        [(clojure.string/includes? ?block-str ?search-text)]
        [?block :block/uid ?block-uid]
        (ancestor ?block ?page)
        [?page :node/title ?page-title]]`;

  let result;
  try {
    result = await roamQuery(config, ancestorQuery, [searchText, ancestorRule]);
  } catch {
    const simpleQuery = `[:find ?block-str ?block-uid ?page-title
 :in $ ?search-text
 :where [?block :block/string ?block-str]
        [(clojure.string/includes? ?block-str ?search-text)]
        [?block :block/uid ?block-uid]
        [?page :block/children ?block]
        [?page :node/title ?page-title]]`;
    result = await roamQuery(config, simpleQuery, [searchText]);
  }

  const byPage = {};
  for (const [blockStr, blockUid, srcPageTitle] of result) {
    if (!byPage[srcPageTitle]) byPage[srcPageTitle] = [];
    byPage[srcPageTitle].push({ string: blockStr, uid: blockUid });
  }

  if (jsonOutput) {
    const references = Object.entries(byPage).map(([page, blocks]) => ({ page, blocks }));
    console.log(JSON.stringify({ search: searchText, count: result.length, references }, null, 2));
  } else {
    console.log(`Search results for "${searchText}" (${result.length} found):\n`);
    const pages = Object.keys(byPage).sort();
    if (pages.length === 0) {
      console.log('  (no results found)');
    } else {
      for (const page of pages) {
        console.log(`From "${page}":`);
        for (const block of byPage[page]) {
          const preview = block.string.length > 100 ? block.string.substring(0, 97) + '...' : block.string;
          console.log(`  - ${preview} (uid: ${block.uid})`);
        }
        console.log('');
      }
    }
  }
}

async function readReferences(config, pageTitle, jsonOutput) {
  // Strip leading # so both "#Tag/Movie" and "Tag/Movie" work
  const resolvedTitle = pageTitle.startsWith('#') ? pageTitle.slice(1) : pageTitle;

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
    result = await roamQuery(config, ancestorQuery, [resolvedTitle, ancestorRule]);
  } catch {
    const simpleQuery = `[:find ?block-str ?block-uid ?page-title
 :in $ ?ref-title
 :where [?ref-page :node/title ?ref-title]
        [?block :block/refs ?ref-page]
        [?block :block/string ?block-str]
        [?block :block/uid ?block-uid]
        [?page :node/title ?page-title]
        [?page :block/children ?block]]`;
    result = await roamQuery(config, simpleQuery, [resolvedTitle]);
  }

  const byPage = {};
  for (const [blockStr, blockUid, srcPageTitle] of result) {
    if (!byPage[srcPageTitle]) byPage[srcPageTitle] = [];
    byPage[srcPageTitle].push({ string: blockStr, uid: blockUid });
  }

  if (jsonOutput) {
    const references = Object.entries(byPage).map(([page, blocks]) => ({ page, blocks }));
    console.log(JSON.stringify({ referenceTo: resolvedTitle, count: result.length, references }, null, 2));
  } else {
    console.log(`References to "${resolvedTitle}" (${result.length} found):\n`);
    const pages = Object.keys(byPage).sort();
    if (pages.length === 0) {
      console.log('  (no references found)');
    } else {
      for (const page of pages) {
        console.log(`From "${page}":`);
        for (const block of byPage[page]) {
          const preview = block.string.length > 100 ? block.string.substring(0, 97) + '...' : block.string;
          console.log(`  - ${preview} (uid: ${block.uid})`);
        }
        console.log('');
      }
    }
  }
}

async function readModifiedToday(config, jsonOutput) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startTimestamp = startOfDay.getTime();

  const ancestorRule = '[[(ancestor ?b ?a) [?a :block/children ?b]] [(ancestor ?b ?a) [?parent :block/children ?b] (ancestor ?parent ?a)]]';
  const ancestorQuery = `[:find ?title (max ?time)
 :in $ ?start_of_day %
 :where [?page :node/title ?title]
        (ancestor ?block ?page)
        [?block :edit/time ?time]
        [(> ?time ?start_of_day)]]`;

  let result;
  try {
    result = await roamQuery(config, ancestorQuery, [startTimestamp, ancestorRule]);
  } catch {
    const simpleQuery = `[:find ?title (max ?time)
 :where [?page :node/title ?title]
        [?page :edit/time ?time]
        [(> ?time ${startTimestamp})]]`;
    result = await roamQuery(config, simpleQuery);
  }

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
        console.log(`  ${i + 1}. ${title}${time ? ` (last edit: ${time})` : ''}`);
      });
    }
  }
}

async function main() {
  const options = parseArgs();

  if (options.help) { showUsage(); process.exit(0); }

  if (options.uidOnly && !options.find) {
    console.error('Error: --uid-only requires --find');
    process.exit(1);
  }
  if (options.find && !options.page) {
    console.error('Error: --find requires --page');
    process.exit(1);
  }

  const modes = [options.page, options.block, options.references, options.search, options.modifiedToday].filter(Boolean);
  if (modes.length === 0) {
    console.error('Error: Must specify one of --page, --block, --references, --search, or --modified-today');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }
  if (modes.length > 1 && !(options.page && options.find)) {
    console.error('Error: Cannot combine --page, --block, --references, --search, and --modified-today');
    process.exit(1);
  }

  const config = loadConfig();

  try {
    if (options.page && options.find) await findInPage(config, options.page, options.find, options.uidOnly, options.json);
    else if (options.page) await readPage(config, options.page, options.json, options.resolveRefs);
    else if (options.block) await readBlock(config, options.block, options.json, options.resolveRefs);
    else if (options.references) await readReferences(config, options.references, options.json);
    else if (options.search) await searchAllPages(config, options.search, options.json);
    else if (options.modifiedToday) await readModifiedToday(config, options.json);
  } catch (error) {
    console.error('\nFatal error:');
    if (error.statusCode) {
      console.error(`  HTTP ${error.statusCode}: ${error.body || error.message}`);
    } else {
      console.error(`  ${error.message || error}`);
    }
    process.exit(1);
  }
}

main();
