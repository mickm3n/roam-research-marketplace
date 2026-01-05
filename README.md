# Roam Research Marketplace for Claude Code

A marketplace containing Claude Code plugins for Roam Research integration.

## Quick Start

### 1. Add this marketplace

```bash
/plugin marketplace add mickm3n/roam-research-marketplace
```

### 2. Install the roam-research plugin

```bash
/plugin install roam-research@roam-research-marketplace
```

### 3. Set environment variables

```bash
export ROAM_API_TOKEN="roam-graph-token-xxxxxxxxxxxxxxxxxx"
export ROAM_GRAPH_NAME="your-graph-name"
claude
```

## Available Plugins

### roam-research

Create and manage pages in Roam Research via the Backend API.

**Features:**
- Create pages in Roam Research from Claude Code
- Bulk operations (monthly pages, daily notes, project pages)
- Flexible input methods (CLI, file, stdin)
- Dry-run mode to preview changes
- Automatic duplicate handling

**Installation:**
```bash
/plugin install roam-research@roam-research-marketplace
```

**Usage:**
```
Create 2026/January through 2026/December pages in my Roam Research
```

See the [roam-research plugin README](./plugins/roam-research/README.md) for detailed documentation.

## Requirements

- Node.js (v12 or higher)
- Claude Code
- Roam Research account with API access
- Valid Roam API token with read+edit permissions

## Getting Your Roam API Token

1. Open your Roam Research graph
2. Go to **Settings → Graph** tab
3. Find the "API tokens" section
4. Create a new token with **"read+edit"** permissions
5. Copy the token (starts with `roam-graph-token-`)

## Configuration

Set these environment variables before starting Claude Code:

```bash
export ROAM_API_TOKEN="roam-graph-token-xxxxxxxxxxxxxxxxxx"
export ROAM_GRAPH_NAME="your-graph-name"
```

Or add to your shell profile (`~/.bashrc`, `~/.zshrc`):

```bash
# Roam Research credentials
export ROAM_API_TOKEN="roam-graph-token-xxxxxxxxxxxxxxxxxx"
export ROAM_GRAPH_NAME="your-graph-name"
```

## Support

For issues or questions:
- Check plugin documentation in `./plugins/roam-research/README.md`
- Open an issue on GitHub
- Review Roam Research API documentation

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
