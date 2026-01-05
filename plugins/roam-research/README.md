# Roam Research Plugin for Claude Code

This plugin enables Claude Code to interact with your Roam Research graph via the Roam Backend API.

## Features

- Create pages in Roam Research from Claude Code
- Support for bulk operations (monthly pages, daily notes, project pages, etc.)
- Flexible input methods (command line, file, stdin)
- Dry-run mode to preview changes
- Automatic handling of duplicate pages
- Custom page properties (children-view-type, etc.)

## Installation

### 1. Install the Plugin

```bash
# Install to user scope (available in all projects)
/plugin install roam-research@your-marketplace --scope user
```

### 2. Get Your Roam API Token

1. Open your Roam Research graph
2. Go to **Settings → Graph** tab
3. Find the "API tokens" section
4. Create a new token with **"read+edit"** permissions
5. Copy the token (it starts with `roam-graph-token-`)

### 3. Set Environment Variables

Set the following environment variables before starting Claude Code:

```bash
export ROAM_API_TOKEN="roam-graph-token-xxxxxxxxxxxxxxxxxx"
export ROAM_GRAPH_NAME="your-graph-name"
claude
```

**For permanent setup**, add to your shell profile (`~/.bashrc`, `~/.zshrc`, or `~/.bash_profile`):

```bash
# Roam Research credentials
export ROAM_API_TOKEN="roam-graph-token-xxxxxxxxxxxxxxxxxx"
export ROAM_GRAPH_NAME="your-graph-name"
```

Replace:
- `your-graph-name` with your actual Roam graph name (found in your graph URL)
- `roam-graph-token-xxxxxxxxxxxxxxxxxx` with your actual API token

### 4. Verify Installation

```bash
# Check environment variables are set
echo $ROAM_API_TOKEN
echo $ROAM_GRAPH_NAME

# Start Claude Code
claude
```

## Usage

Once installed and configured, you can ask Claude to create pages in your Roam Research graph.

### Example Requests

**Create monthly pages for 2026:**
```
Create 2026/January through 2026/December pages in my Roam Research
```

**Create specific pages:**
```
Create pages titled "Project Alpha", "Project Beta", and "Project Gamma" in Roam
```

**Create daily notes:**
```
Create daily note pages for January 2026
```

**Create pages with numbered view:**
```
Create a "Meeting Notes" page with numbered children view in Roam
```

## Manual Script Usage

The plugin includes a `create-pages.js` script that can be used directly:

### From Command Line

```bash
# Set environment variables first
export ROAM_API_TOKEN="roam-graph-token-xxx"
export ROAM_GRAPH_NAME="my-graph"

# Create specific pages
node roam-research-plugin/skills/roam-research/scripts/create-pages.js \
  --titles "Project Alpha,Project Beta,Project Gamma"

# With children view type
node roam-research-plugin/skills/roam-research/scripts/create-pages.js \
  --titles "Meeting Notes" \
  --children-view-type numbered
```

### From File

Create a file `pages.txt` with one title per line:
```
2026/January
2026/February
2026/March
```

Then run:
```bash
node roam-research-plugin/skills/roam-research/scripts/create-pages.js --file pages.txt
```

### From Stdin (Pipe)

```bash
# Generate titles and pipe them
echo -e "2026/January\n2026/February\n2026/March" | \
  node roam-research-plugin/skills/roam-research/scripts/create-pages.js --stdin

# Or use any command that outputs titles
cat my-pages.txt | \
  node roam-research-plugin/skills/roam-research/scripts/create-pages.js --stdin
```

### Dry Run

Preview what would be created without making API calls:

```bash
echo -e "Page 1\nPage 2\nPage 3" | \
  node roam-research-plugin/skills/roam-research/scripts/create-pages.js --stdin --dry-run
```

### Get Help

```bash
node roam-research-plugin/skills/roam-research/scripts/create-pages.js --help
```

## API Limits

- **Rate Limit:** 50 requests per minute per graph
- The script creates pages one by one to handle duplicates gracefully
- Duplicate pages are automatically skipped

## Troubleshooting

### Error: Environment variables not set

Make sure you've exported the required environment variables:
```bash
export ROAM_API_TOKEN="roam-graph-token-xxx"
export ROAM_GRAPH_NAME="my-graph"
```

Verify they're set:
```bash
echo $ROAM_API_TOKEN
echo $ROAM_GRAPH_NAME
```

### Error: 401 Unauthorized

- Check that your API token is correct
- Verify the token has "read+edit" permissions
- Make sure the graph name is correct
- Ensure the token starts with `roam-graph-token-`

### Error: 429 Too Many Requests

You've hit the rate limit (50 requests/minute). Wait a minute and try again.

### Error: 503 Service Unavailable

The graph is not ready yet. Wait a moment and try again.

## Security Notes

**Important:** This plugin uses environment variables to store your API credentials, ensuring:
- Credentials are never stored in code or configuration files
- No risk of accidentally committing secrets to version control
- Easy to rotate tokens without changing code
- Follows security best practices

**Never:**
- Share your API token publicly
- Commit `.env` files containing tokens
- Hardcode tokens in scripts

## Script Features

- **Flexible Input**: Accept titles from command line, files, or stdin
- **Individual Requests**: Creates pages one by one for better error handling
- **Duplicate Removal**: Automatically removes duplicate titles
- **Duplicate Detection**: Skips pages that already exist
- **Dry Run Mode**: Preview changes before executing
- **Custom Properties**: Support for children-view-type and other page properties
- **Error Handling**: Comprehensive error messages and status codes
- **Progress Indicator**: Shows progress during bulk operations

## Requirements

- Node.js (v12 or higher)
- Claude Code
- Roam Research account with API access
- Valid Roam API token with read+edit permissions

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any issues or have questions:
1. Check the troubleshooting section above
2. Review the Roam Research API documentation
3. Open an issue on GitHub

## Changelog

### 1.0.0 (2026-01-05)
- Initial release
- Support for creating pages via API
- Flexible input methods (CLI, file, stdin)
- Environment variable configuration
- Dry-run mode
- Comprehensive error handling
