/**
 * Simulates exactly what Claude Desktop does with the generated config:
 * spawn `npx mcp-remote <url> --header "Authorization: Bearer <token>"` as a
 * stdio MCP server and talk to it. If this lists tools, the Desktop config
 * works (live differs only by URL/network, which the user's machine can reach).
 */
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const url = process.env.TEST_URL!;
const token = process.env.TEST_TOKEN!;

const client = new Client({ name: "desktop-sim", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["-y", "mcp-remote", url, "--header", `Authorization: Bearer ${token}`],
    env: { ...getDefaultEnvironment() },
  }),
);

const { tools } = await client.listTools();
console.log("TOOLS=" + tools.length + " :: " + tools.map((t) => t.name).join(","));

// a quick read-only call to prove end-to-end round trip through the bridge
const probe = await client.callTool({
  name: "render_list_outputs",
  arguments: { limit: 3 },
});
console.log("LIST_OK=" + (!probe.isError));
await client.close();
console.log("DESKTOP_BRIDGE_OK");
