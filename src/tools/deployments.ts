import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { vercelFetch } from "../client.js";

export function registerDeploymentTools(server: McpServer) {
  server.tool(
    "vercel_list_deployments",
    "List deployments for a project, environment, or the entire team. Filter by projectId, target, or createdAt time range. Returns the most recent first.",
    {
      projectId: z
        .string()
        .optional()
        .describe(
          "Filter to a single project. Omit to list across all projects.",
        ),
      target: z
        .enum(["production", "preview"])
        .optional()
        .describe("Filter by deployment target."),
      limit: z.number().int().min(1).max(100).default(20),
      since: z
        .number()
        .int()
        .optional()
        .describe("Unix ms epoch — only deployments created after this."),
      until: z
        .number()
        .int()
        .optional()
        .describe("Unix ms epoch — only deployments created before this."),
    },
    async (args) => {
      const data = await vercelFetch("/v6/deployments", {
        query: {
          projectId: args.projectId,
          target: args.target,
          limit: args.limit,
          since: args.since,
          until: args.until,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_get_deployment",
    "Get full details for a single deployment by ID or URL: state, target, ready time, build info, alias.",
    {
      idOrUrl: z
        .string()
        .min(3)
        .describe(
          "Deployment ID (dpl_...) or full URL (e.g. keep-abc123.vercel.app).",
        ),
    },
    async ({ idOrUrl }) => {
      const data = await vercelFetch(
        `/v13/deployments/${encodeURIComponent(idOrUrl)}`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_get_deployment_logs",
    "Get build + runtime logs for a deployment. Useful for debugging failed builds.",
    {
      idOrUrl: z.string().min(3),
      limit: z.number().int().min(1).max(1000).default(200),
    },
    async ({ idOrUrl, limit }) => {
      const data = await vercelFetch(
        `/v3/deployments/${encodeURIComponent(idOrUrl)}/events`,
        { query: { limit, builds: 1 } },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_cancel_deployment",
    "Cancel an in-progress deployment. Idempotent on already-finished deployments.",
    {
      deploymentId: z.string().min(3),
    },
    async ({ deploymentId }) => {
      const data = await vercelFetch(
        `/v12/deployments/${encodeURIComponent(deploymentId)}/cancel`,
        { method: "PATCH" },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_delete_deployment",
    "Permanently delete a deployment. Cannot be undone. Production deployments cannot be deleted while serving traffic.",
    {
      deploymentId: z.string().min(3),
      confirm: z.boolean().default(false),
    },
    async ({ deploymentId, confirm }) => {
      if (!confirm) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  dry_run: true,
                  message: "Re-call with confirm:true to actually delete.",
                  request: {
                    method: "DELETE",
                    path: `/v13/deployments/${deploymentId}`,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }
      const data = await vercelFetch(
        `/v13/deployments/${encodeURIComponent(deploymentId)}`,
        { method: "DELETE" },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
