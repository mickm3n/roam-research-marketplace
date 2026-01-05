#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Show usage information
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
  # Set environment variables first
  export ROAM_API_TOKEN="roam-graph-token-xxx"
  export ROAM_GRAPH_NAME="my-graph"

  # Create pages from command line
  create-pages.js --titles "Project A,Project B,Project C"

  # Create pages from file
  create-pages.js --file pages.txt

  # Create pages from stdin
  echo -e "Page 1\\nPage 2\\nPage 3" | create-pages.js --stdin

  # Create pages with numbered children view
  create-pages.js --titles "Meeting Notes" --children-view-type numbered

  # Generate monthly pages and create them
  echo -e "2026/January\\n2026/February\\n2026/March" | create-pages.js --stdin
`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    titles: [],
    file: null,
    stdin: false,
    childrenViewType: null,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--titles':
        options.titles = args[++i].split(',').map(t => t.trim()).filter(t => t);
        break;
      case '--file':
      case '-f':
        options.file = args[++i];
        break;
      case '--stdin':
        options.stdin = true;
        break;
      case '--children-view-type':
        options.childrenViewType = args[++i];
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

  return {
    graphName,
    apiToken
  };
}

// Read titles from file
async function readTitlesFromFile(filePath) {
  return new Promise((resolve, reject) => {
    const titles = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      const title = line.trim();
      if (title && !title.startsWith('#')) { // Skip empty lines and comments
        titles.push(title);
      }
    });

    rl.on('close', () => resolve(titles));
    rl.on('error', reject);
  });
}

// Read titles from stdin
async function readTitlesFromStdin() {
  return new Promise((resolve) => {
    const titles = [];
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', (line) => {
      const title = line.trim();
      if (title && !title.startsWith('#')) { // Skip empty lines and comments
        titles.push(title);
      }
    });

    rl.on('close', () => resolve(titles));
  });
}

// Get titles from various sources
async function getTitles(options) {
  let titles = [];

  // Priority: stdin > file > command line
  if (options.stdin) {
    titles = await readTitlesFromStdin();
  } else if (options.file) {
    titles = await readTitlesFromFile(options.file);
  } else if (options.titles.length > 0) {
    titles = options.titles;
  }

  return titles;
}

// Create batch actions for page creation
function createBatchActions(titles, options) {
  return {
    action: 'batch-actions',
    actions: titles.map(title => {
      const page = { title };

      // Add optional properties
      if (options.childrenViewType) {
        page['children-view-type'] = options.childrenViewType;
      }

      return {
        action: 'create-page',
        page
      };
    })
  };
}

// Make API request to Roam
function makeRoamRequest(config, data, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);

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
      timeout: timeout
    };

    const makeRequest = (requestOptions) => {
      const req = https.request(requestOptions, (res) => {
        let responseData = '';

        // Handle redirect
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 308) {
          const redirectUrl = new URL(res.headers.location);

          const redirectOptions = {
            hostname: redirectUrl.hostname,
            port: redirectUrl.port || 443,
            path: redirectUrl.pathname + redirectUrl.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              'Authorization': `Bearer ${config.apiToken}`,
              'Accept': 'application/json'
            },
            timeout: timeout
          };

          const redirectReq = https.request(redirectOptions, (redirectRes) => {
            let redirectData = '';

            redirectRes.on('data', (chunk) => {
              redirectData += chunk;
            });

            redirectRes.on('end', () => {
              if (redirectRes.statusCode === 200) {
                resolve({
                  statusCode: redirectRes.statusCode,
                  data: redirectData ? JSON.parse(redirectData) : {}
                });
              } else {
                reject({
                  statusCode: redirectRes.statusCode,
                  message: redirectData
                });
              }
            });
          });

          redirectReq.on('error', reject);
          redirectReq.on('timeout', () => {
            redirectReq.destroy();
            reject(new Error('Request timeout'));
          });
          redirectReq.write(payload);
          redirectReq.end();
          return;
        }

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({
              statusCode: res.statusCode,
              data: responseData ? JSON.parse(responseData) : {}
            });
          } else {
            reject({
              statusCode: res.statusCode,
              message: responseData
            });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.write(payload);
      req.end();
    };

    makeRequest(options);
  });
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

    // Get titles from various sources
    const titles = await getTitles(options);

    if (titles.length === 0) {
      console.error('Error: No page titles provided.');
      console.error('Use --titles, --file, or --stdin to provide page titles.');
      console.error('Run with --help for usage information.');
      process.exit(1);
    }

    // Remove duplicates while preserving order
    const uniqueTitles = [...new Set(titles)];

    if (options.dryRun) {
      console.log('Dry run mode - no pages will be created');
      console.log(`Would create ${uniqueTitles.length} pages:`);
      uniqueTitles.forEach((title, i) => {
        console.log(`  ${i + 1}. ${title}`);
      });
      if (options.childrenViewType) {
        console.log(`With children-view-type: ${options.childrenViewType}`);
      }
      process.exit(0);
    }

    // Load config for actual API calls
    const config = loadConfig();

    console.log(`Creating ${uniqueTitles.length} pages in Roam Research graph: ${config.graphName}`);
    if (options.childrenViewType) {
      console.log(`Children view type: ${options.childrenViewType}`);
    }
    console.log('');

    // Create pages one by one to handle duplicates gracefully
    const results = {
      created: [],
      skipped: [],
      failed: []
    };

    for (const title of uniqueTitles) {
      try {
        const action = {
          action: 'create-page',
          page: { title }
        };

        if (options.childrenViewType) {
          action.page['children-view-type'] = options.childrenViewType;
        }

        await makeRoamRequest(config, action);
        results.created.push(title);
        process.stdout.write('.');
      } catch (error) {
        if (error.statusCode && error.message) {
          try {
            const errorData = JSON.parse(error.message);
            // Check if it's a duplicate page error
            if (errorData.message && errorData.message.includes('already exists')) {
              results.skipped.push(title);
              process.stdout.write('s');
            } else {
              results.failed.push({ title, error: errorData.message });
              process.stdout.write('x');
            }
          } catch (e) {
            results.failed.push({ title, error: error.message });
            process.stdout.write('x');
          }
        } else {
          results.failed.push({ title, error: error.message || 'Unknown error' });
          process.stdout.write('x');
        }
      }
    }

    console.log('\n');
    console.log('Summary:');
    console.log(`  ✓ Created: ${results.created.length}`);
    console.log(`  ⊙ Skipped (already exists): ${results.skipped.length}`);
    console.log(`  ✗ Failed: ${results.failed.length}`);
    console.log('');

    if (results.created.length > 0) {
      console.log('Created pages:');
      results.created.forEach((title, i) => {
        console.log(`  ${i + 1}. ${title}`);
      });
      console.log('');
    }

    if (results.skipped.length > 0) {
      console.log('Skipped pages (already exist):');
      results.skipped.forEach((title, i) => {
        console.log(`  ${i + 1}. ${title}`);
      });
      console.log('');
    }

    if (results.failed.length > 0) {
      console.log('Failed pages:');
      results.failed.forEach(({ title, error }, i) => {
        console.log(`  ${i + 1}. ${title}: ${error}`);
      });
      console.log('');
    }

    // Exit with error if any pages failed (but not if just skipped)
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
