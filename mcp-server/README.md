# Primordia Clearing MCP Server

MCP server exposing Primordia clearing tools for AI agents.

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the Primordia kernel URL via environment variable:

```bash
export PRIMORDIA_KERNEL_URL=http://localhost:3000
```

Default: `http://localhost:3000`

## Tools

### Free Operations

- **verify_receipt**: Verify MSR/IAN/FC signature
- **verify_seal**: Verify conformance seal

### Paid Operations

- **net_receipts**: Net receipts into signed IAN
- **open_credit_line**: Open credit line with MBS backing
- **commit_future**: Commit Future Commitment
- **trigger_default**: Trigger default event

## Usage with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "primordia-clearing": {
      "command": "node",
      "args": ["C:\\Users\\trunk\\primordia\\mcp-server\\build\\index.js"],
      "env": {
        "PRIMORDIA_KERNEL_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Development

```bash
# Watch mode
npm run watch

# Build
npm run build
```

## License

MIT
