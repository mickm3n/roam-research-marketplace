---
name: roam-research
description: Create pages and write content to Roam Research via API. Use when the user wants to create pages, write content to today's daily notes, write to a specific page, or perform bulk operations in their Roam Research graph.
allowed-tools: Bash, Read, Write, Edit
---

# Roam Research Integration

This Skill allows you to interact with Roam Research via their Backend API to create pages, write content to pages, and perform other write operations.

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

## Available Scripts

This Skill provides two scripts:

| Script | Purpose | Use When |
|--------|---------|----------|
| `create-pages.js` | Create new pages | User wants to create one or more pages |
| `write-content.js` | Write content blocks to a page | User wants to add text/content to a page |

---

## Script 1: Create Pages (`create-pages.js`)

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

### Create Pages Workflow

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

---

## Script 2: Write Content (`write-content.js`)

The `write-content.js` script writes content (blocks) to an existing or new page in Roam Research. It supports writing to today's daily notes page or any specified page.

### Target Page

Specify the target page using one of:

- `--today` or `-t`: Write to today's daily notes page (auto-generates title like "February 5th, 2026")
- `--page <title>` or `-p <title>`: Write to a specific page by title

### Content Input

Provide content using one of:

- `--content <text>` or `-c <text>`: Write a single block
- `--stdin`: Read content from stdin (one block per line, skips empty lines and comments starting with #)

### Options

- `--dry-run`: Preview what would be written without making API calls
- `--help`: Show usage information

### Write Content Workflow

When the user requests to write content to a page:

1. **Verify environment variables**: Check that the required environment variables are set
   ```bash
   if [ -z "$ROAM_API_TOKEN" ] || [ -z "$ROAM_GRAPH_NAME" ]; then
     echo "Error: Please set ROAM_API_TOKEN and ROAM_GRAPH_NAME environment variables"
     exit 1
   fi
   ```

2. **Determine the target page**:
   - If the user wants to write to today's page, use `--today`
   - If the user specifies a page name, use `--page "Page Title"`

3. **Prepare the content**: Based on the user's request, determine the text to write
   - The content supports full Roam markdown syntax (e.g., `**bold**`, `[[page links]]`, `#tags`, `{{TODO}}`)

4. **Write content**: Use the script with appropriate method
   ```bash
   # Write to today's daily notes
   node scripts/write-content.js --today --content "Meeting notes from standup"

   # Write to a specific page
   node scripts/write-content.js --page "Project Alpha" --content "TODO: Review design doc"

   # Write multiple blocks from stdin
   echo -e "First block\nSecond block\nThird block" | \
     node scripts/write-content.js --page "Meeting Notes" --stdin
   ```

5. **Handle errors**: Check for API errors and rate limits

6. **Confirm completion**: Let the user know what was written and to which page

### How It Works

1. The script first queries Roam's API to find the target page's UID
2. If the page doesn't exist, it automatically creates it
3. Content is appended as new blocks at the end of the page
4. Each line (when using `--stdin`) becomes a separate block

---

## Important Notes

1. **Rate Limits**: Roam API has a limit of 50 requests per minute per graph
2. **Authentication**: The API token must start with `roam-graph-token-` and be passed with `Bearer` prefix
3. **Batch Operations**: Scripts use individual requests to handle errors gracefully
4. **Duplicate Handling**: `create-pages.js` automatically skips pages that already exist; `write-content.js` automatically creates the page if it doesn't exist
5. **Page Title Formats**:
   - Daily notes use format: "January 21st, 2021"
   - Custom pages can use any format like "2026/January", "Project Alpha", etc.
6. **Content Format**: Content written via `write-content.js` supports Roam's markdown syntax including `**bold**`, `[[links]]`, `#tags`, `((block references))`, `{{TODO}}`, etc.

## Error Handling

Common errors and solutions:
- **400 BAD REQUEST**: Check input format and parameter values
- **401 UNAUTHORIZED**: Verify API token and permissions (check ROAM_API_TOKEN environment variable)
- **429 TOO MANY REQUESTS**: Slow down, you've hit the rate limit (50 req/min)
- **503 SERVICE UNAVAILABLE**: Graph is not ready, try again in a moment
- **Environment variables not set**: User needs to export ROAM_API_TOKEN and ROAM_GRAPH_NAME

## Example Usage

### Creating Pages

**Example 1: Monthly pages for 2026**

User: "Create monthly pages for 2026 in my Roam Research (format: 2026/January)"

Your workflow:
```bash
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

### Writing Content

**Example 3: Write to today's daily notes**

User: "Add a note to today's Roam page: Had a great brainstorming session about the new product."

Your workflow:
```bash
node scripts/write-content.js \
  --today \
  --content "Had a great brainstorming session about the new product."
```

**Example 4: Write to a specific page**

User: "Add 'Review Q1 metrics' to my Project Alpha page in Roam"

Your workflow:
```bash
node scripts/write-content.js \
  --page "Project Alpha" \
  --content "Review Q1 metrics"
```

**Example 5: Write multiple blocks**

User: "Add my meeting notes to the Team Standup page: discussed roadmap, assigned tasks to Bob, next meeting Friday"

Your workflow:
```bash
echo -e "discussed roadmap\nassigned tasks to Bob\nnext meeting Friday" | \
  node scripts/write-content.js --page "Team Standup" --stdin
```

**Example 6: Write with Roam formatting**

User: "Add a TODO item to today's page: finish the design review"

Your workflow:
```bash
node scripts/write-content.js \
  --today \
  --content "{{TODO}} finish the design review"
```

**Example 7: Dry run first**

```bash
# Preview what would be written
node scripts/write-content.js --today --content "Test content" --dry-run

# If looks good, write it
node scripts/write-content.js --today --content "Test content"
```

## Security Notes

- **Never hardcode API tokens** in scripts or configuration files
- Environment variables are the recommended way to provide credentials
- Tokens are not logged or displayed in output
- Make sure not to commit `.env` files or similar to version control
