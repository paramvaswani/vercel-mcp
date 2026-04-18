#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDeploymentTools } from "./tools/deployments.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerEnvTools } from "./tools/env.js";
import { registerAliasTools } from "./tools/aliases.js";

const server = new McpServer({
  name: "vercel-mcp-server",
  version: "0.1.0",
});

registerDeploymentTools(server);
registerProjectTools(server);
registerEnvTools(server);
registerAliasTools(server);

async function main() {
  if (!process.env.VERCEL_TOKEN) {
    console.error(
      "ERROR: VERCEL_TOKEN must be set. Generate at https://vercel.com/account/tokens",
    );
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("vercel-mcp-server running via stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
