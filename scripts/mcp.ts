// Runs the Sunwalks MCP server over stdio, for Claude Desktop, Claude Code
// and the MCP Inspector (see docs/mcp.md):
//   npm run --silent mcp
// stdout is the protocol channel, so nothing here may print to it.
//
// Imports are static on purpose: a dynamic import() would load the SDK's
// ESM build next to the CommonJS one the rest of the server gets, and
// serveStdio would no longer recognise the McpServer it's handed.
import "./quiet-env";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createSunwalksServer } from "../src/mcp/server";

const handle = serveStdio(() => createSunwalksServer(), { onerror: (err) => console.error("mcp:", err) });
const stop = () => void handle.close().finally(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// The client closing stdin ends the session; the database pool would keep the process alive otherwise.
process.stdin.on("close", stop);
