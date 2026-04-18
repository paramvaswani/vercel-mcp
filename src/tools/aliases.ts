import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { vercelFetch } from "../client.js";

export function registerAliasTools(server: McpServer) {
  server.tool(
    "vercel_promote_to_production",
    "Promote a specific deployment to production by aliasing the project's production domain(s) at it. Use this to instant-rollback to a known-good preview without redeploying.",
    {
      deploymentId: z
        .string()
        .min(3)
        .describe("Deployment ID (dpl_...) to promote."),
      idOrName: z.string().min(1).describe("Project ID or name."),
    },
    async ({ deploymentId, idOrName }) => {
      const data = await vercelFetch(
        `/v10/projects/${encodeURIComponent(idOrName)}/promote/${encodeURIComponent(deploymentId)}`,
        { method: "POST" },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_list_aliases",
    "List domain aliases for a project. Aliases are which domain currently points at which deployment.",
    {
      projectId: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ projectId, limit }) => {
      const data = await vercelFetch(`/v4/aliases`, {
        query: { projectId, limit },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
