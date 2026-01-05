---
name: roam-research
description: Create and manage pages in Roam Research via API. Use when the user wants to create pages, update pages, or perform bulk operations in their Roam Research graph.
allowed-tools: Bash, Read, Write, Edit
---

# Roam Research Integration

This Skill allows you to interact with Roam Research via their Backend API to create pages, update content, and perform other write operations.

## Prerequisites

Before using this Skill, ensure that:
1. Environment variables `ROAM_API_TOKEN` and `ROAM_GRAPH_NAME` are set
2. Node.js is installed on the system

## Configuration

This Skill requires the following environment variables:

- **ROAM_API_TOKEN**: Your Roam Research API token (starts with `roam-graph-token-`)
- **ROAM_GRAPH_NAME**: Your Roam Research graph name

### Setting Environment Variables

Users should set these variables before starting Claude Code:

```bash
export ROAM_API_TOKEN="roam-graph-token-xxxxxxxxxxxxxxxxxx"
export ROAM_GRAPH_NAME="your-graph-name"
claude
```

Or add to their shell profile (~/.bashrc, ~/.zshrc):

```bash
# Roam Research credentials
export ROAM_API_TOKEN="roam-graph-token-xxxxxxxxxxxxxxxxxx"
export ROAM_GRAPH_NAME="your-graph-name"
```

### Verification

Before using this Skill, verify that environment variables are set:

```bash
echo $ROAM_API_TOKEN
echo $ROAM_GRAPH_NAME
```

## Create Pages Script

The `create-pages.js` script is a general-purpose tool for creating pages in Roam Research.

### Input Methods

The script accepts page titles in three ways:

1. **Command line**: `--titles "Title 1,Title 2,Title 3"`
2. **From file**: `--file pages.txt` (one title per line)
3. **From stdin**: `--stdin` (pipe titles from another command)

### Options

- `--children-view-type <type>`: Set children view type (bullet, numbered, document)
- `--dry-run`: Preview what would be created without making API calls
- `--help`: Show usage information

## Workflow

When the user requests to create pages:

1. **Verify environment variables**: Check that the required environment variables are set
   ```bash
   if [ -z "$ROAM_API_TOKEN" ] || [ -z "$ROAM_GRAPH_NAME" ]; then
     echo "Error: Please set ROAM_API_TOKEN and ROAM_GRAPH_NAME environment variables"
     exit 1
   fi
   ```

2. **Determine page titles**: Based on user's request, figure out what pages need to be created
   - For monthly pages: Generate titles like "2026/January", "2026/February", etc.
   - For daily notes: Use Roam's format "January 1st, 2026"
   - For custom pages: Use whatever titles the user requests

3. **Create pages**: Use the script with appropriate method
   ```bash
   # Direct titles
   node scripts/create-pages.js --titles "Title 1,Title 2"

   # From stdin (most flexible)
   echo -e "2026/January\n2026/February\n2026/March" | \
     node scripts/create-pages.js --stdin
   ```

4. **Handle errors**: Check for API errors and rate limits

5. **Confirm completion**: Let the user know which pages were created

## Important Notes

1. **Rate Limits**: Roam API has a limit of 50 requests per minute per graph
2. **Authentication**: The API token must start with `roam-graph-token-` and be passed with `Bearer` prefix
3. **Batch Operations**: The script uses individual requests to handle duplicates gracefully
4. **Duplicate Handling**: The script automatically skips pages that already exist
5. **Page Title Formats**:
   - Daily notes use format: "January 21st, 2021"
   - Custom pages can use any format like "2026/January", "Project Alpha", etc.

## Error Handling

Common errors and solutions:
- **400 BAD REQUEST**: Check input format and parameter values
- **401 UNAUTHORIZED**: Verify API token and permissions (check ROAM_API_TOKEN environment variable)
- **429 TOO MANY REQUESTS**: Slow down, you've hit the rate limit (50 req/min)
- **503 SERVICE UNAVAILABLE**: Graph is not ready, try again in a moment
- **Environment variables not set**: User needs to export ROAM_API_TOKEN and ROAM_GRAPH_NAME

## Example Usage

**Example 1: Monthly pages for 2026**

User: "Create monthly pages for 2026 in my Roam Research (format: 2026/January)"

Your workflow:
```bash
# Generate the page titles and pipe to create-pages.js
echo -e "2026/January\n2026/February\n2026/March\n2026/April\n2026/May\n2026/June\n2026/July\n2026/August\n2026/September\n2026/October\n2026/November\n2026/December" | \
  node scripts/create-pages.js --stdin
```

**Example 2: Project pages**

User: "Create pages for my three projects: Alpha, Beta, and Gamma"

Your workflow:
```bash
node scripts/create-pages.js \
  --titles "Project Alpha,Project Beta,Project Gamma"
```

**Example 3: Dry run first**

```bash
# Preview what would be created
echo -e "Page 1\nPage 2" | \
  node scripts/create-pages.js --stdin --dry-run

# If looks good, create them
echo -e "Page 1\nPage 2" | \
  node scripts/create-pages.js --stdin
```

## Security Notes

- **Never hardcode API tokens** in scripts or configuration files
- Environment variables are the recommended way to provide credentials
- Tokens are not logged or displayed in output
- Make sure not to commit `.env` files or similar to version control
