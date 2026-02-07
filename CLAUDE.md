# Roam Research Marketplace - Development Notes

## Roam Research API Reference

- **Base URL**: `https://api.roamresearch.com/api/graph/{graphName}/`
- **Auth**: `Authorization: Bearer {token}` (token starts with `roam-graph-token-`)
- **Rate limit**: 50 requests/min per graph

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/q` | POST | Run Datalog queries |
| `/pull` | POST | Pull entity data |
| `/pull-many` | POST | Pull multiple entities |
| `/write` | POST | Write operations (create-page, create-block, batch-actions) |

### Query Format (`/q`)

```json
{ "query": "[:find ...]", "args": [arg1, arg2] }
```

- Use `:in $ ?param` in the query and pass values via `args` array
- For recursive rules, use `:in $ ?param %` and pass the rule string as the last arg

### Key Datalog Attributes

| Attribute | Description |
|-----------|-------------|
| `:node/title` | Page title |
| `:block/uid` | Block/page unique ID |
| `:block/string` | Block text content |
| `:block/order` | Block position among siblings |
| `:block/children` | Child blocks |
| `:block/refs` | Pages referenced by a block (via `[[links]]`) |
| `:edit/time` | Last edit timestamp (epoch ms) |
| `:block/heading` | Heading level (0 = none) |

### Ancestor Rule (for traversing block hierarchies)

```
[[(ancestor ?b ?a) [?a :block/children ?b]]
 [(ancestor ?b ?a) [?parent :block/children ?b] (ancestor ?parent ?a)]]
```

Pass via `args` when using `%` in `:in` clause.

### Daily Notes Title Format

Roam uses: `"February 8th, 2026"` (month name, day with ordinal suffix, comma, year).

## Project Structure

```
plugins/roam-research/skills/roam-research/
  SKILL.md              # Skill definition and documentation
  scripts/
    create-pages.js     # Create pages (batch or individual)
    write-content.js    # Write blocks to a page
    read-content.js     # Read page content, references, modified pages
```

## Script Patterns

All scripts follow the same pattern:
- Self-contained Node.js (no external dependencies)
- `loadConfig()` reads `ROAM_GRAPH_NAME` and `ROAM_API_TOKEN` from env vars
- `makeHttpsRequest()` handles redirects and timeouts
- `parseArgs()` parses CLI flags
- `showUsage()` prints help text
- Exit code 1 on errors

## External Reference

- [roam-research-mcp](https://github.com/2b3pro/roam-research-mcp) - Advanced query patterns and block retrieval logic
