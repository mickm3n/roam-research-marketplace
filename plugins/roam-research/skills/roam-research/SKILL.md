---
name: roam-research
description: Read, create, and write content in Roam Research via API. Use when the user wants to read page content, find blocks by text, find references/backlinks, see recently modified pages, create pages, write content to today's daily notes, write to a specific page, or write under a specific block UID.
allowed-tools: Bash, Read, Write, Edit
---

# Roam Research Integration

This Skill allows you to interact with Roam Research via their Backend API to read page content, find references/backlinks, list recently modified pages, create pages, and write content to pages or specific blocks.

## Prerequisites

Before using this Skill, ensure that:
1. Environment variables `ROAM_API_TOKEN` and `ROAM_GRAPH_NAME` are set
2. Node.js is installed on the system

## Configuration

This Skill requires the following environment variables:

- **ROAM_API_TOKEN**: Your Roam Research API token (starts with `roam-graph-token-`)
- **ROAM_GRAPH_NAME**: Your Roam Research graph name

## Available Scripts

| Script | Purpose |
|--------|---------|
| `read-content.js` | Read page/block content, find blocks by text, find references, list modified pages |
| `create-pages.js` | Create new pages |
| `write-content.js` | Write content blocks to a page or under a specific block UID |

---

## Script: Read Content (`read-content.js`)

### Modes

- `--page <title>` or `-p <title>`: Read the full block tree of a page
- `--block <uid>` or `-b <uid>`: Read a specific block and its children by UID
- `--references <title>` or `-r <title>`: Find all blocks that reference (backlink) a page
- `--modified-today`: List pages with blocks modified today

### Modifiers

- `--find <text>` or `-f <text>`: Search blocks containing text within a page (requires `--page`)
- `--uid-only`: Output only UIDs, one per line (requires `--find`) — useful for piping into `write-content.js --parent`
- `--json`: Output results as JSON (for programmatic use)

### Examples

```bash
ROAM_SCRIPT=$(find ~/.claude/plugins/cache/roam-research-marketplace -name "read-content.js" | head -1)

# Read a page's full block tree
node "$ROAM_SCRIPT" --page "2026/April"

# Read a specific block by UID
node "$ROAM_SCRIPT" --block "HdQFZpcYd"

# Find blocks containing "Review" in a page
node "$ROAM_SCRIPT" --page "2026/April" --find "Review"

# Get only the UID of matching blocks (for piping)
UID=$(node "$ROAM_SCRIPT" --page "2026/April" --find "Review" --uid-only | head -1)

# Find backlinks to a page
node "$ROAM_SCRIPT" --references "Project Alpha"

# List pages modified today
node "$ROAM_SCRIPT" --modified-today

# JSON output for programmatic use
node "$ROAM_SCRIPT" --page "2026/April" --json
```

---

## Script: Write Content (`write-content.js`)

### Target

Specify one of:

- `--page <title>` or `-p <title>`: Write to a specific page (auto-created if it doesn't exist)
- `--today` or `-t`: Write to today's daily notes page
- `--parent <uid>`: Write as children of a specific block UID
- `--update-block <uid>`: Update an existing block's content (use with `--content`)

### Content Input

- `--content <text>` or `-c <text>`: Write a single block
- `--stdin`: Read flat content from stdin (one block per line)
- `--nested`: Read indented content from stdin; 2 spaces per level maps to Roam outline depth

### Options

- `--dry-run`: Preview without making API calls

### Examples

```bash
ROAM_SCRIPT=$(find ~/.claude/plugins/cache/roam-research-marketplace -name "write-content.js" | head -1)

# Write to today's daily notes
node "$ROAM_SCRIPT" --today --content "Meeting notes"

# Write to a specific page
node "$ROAM_SCRIPT" --page "Project Alpha" --content "TODO: Review design doc"

# Write nested blocks to a page
printf '%s\n' \
  "#Tag/Journal" \
  "  **今日完成**" \
  "    - 做了A" \
  "  **心情與狀態**" \
  "    整體不錯" \
  | node "$ROAM_SCRIPT" --page "April 19th, 2026" --nested

# Write under a specific block UID (e.g. weekly Review block)
READ_SCRIPT=$(find ~/.claude/plugins/cache/roam-research-marketplace -name "read-content.js" | head -1)
UID=$(node "$READ_SCRIPT" --page "2026/April" --find "Review" --uid-only | tail -1)
printf '%s\n' "這週完成了..." "下週計畫..." | node "$ROAM_SCRIPT" --parent "$UID" --stdin

# Update an existing block's content
node "$ROAM_SCRIPT" --update-block "abc123xyz" --content "updated content"
```

**Note on `--nested` format**: Do NOT use `- ` prefix on lines — Roam adds bullets automatically. Use 2-space indentation per level.

---

## Script: Create Pages (`create-pages.js`)

```bash
ROAM_SCRIPT=$(find ~/.claude/plugins/cache/roam-research-marketplace -name "create-pages.js" | head -1)

# Create specific pages
node "$ROAM_SCRIPT" --titles "2026/January,2026/February,2026/March"

# Create from stdin
echo -e "Page One\nPage Two" | node "$ROAM_SCRIPT" --stdin
```

---

## Important Notes

1. **Rate Limits**: Roam API has a limit of 50 requests per minute per graph
2. **Auto Page Creation**: `write-content.js` creates the target page automatically if it doesn't exist
3. **Page Title Formats**: Daily notes use format `"January 21st, 2026"`; custom pages use any format like `"2026/April"`
4. **Roam Markdown**: Content supports `**bold**`, `[[links]]`, `#tags`, `((block references))`, `{{TODO}}`, etc.
