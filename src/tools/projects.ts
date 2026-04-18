import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { vercelFetch } from "../client.js";

export function registerProjectTools(server: McpServer) {
  server.tool(
    "vercel_list_projects",
    "List all projects in the team / personal account. Paginated with `limit` and cursor `from`.",
    {
      limit: z.number().int().min(1).max(100).default(20),
      from: z
        .number()
        .int()
        .optional()
        .describe("Pagination cursor (timestamp)."),
      search: z
        .string()
        .optional()
        .describe("Filter by project name substring."),
    },
    async ({ limit, from, search }) => {
      const data = await vercelFetch("/v9/projects", {
        query: { limit, from, search },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_get_project",
    "Get details for a single project: framework, build settings, env vars summary, latest deployments, linked git repo.",
    {
      idOrName: z.string().min(1),
    },
    async ({ idOrName }) => {
      const data = await vercelFetch(
        `/v9/projects/${encodeURIComponent(idOrName)}`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_list_project_domains",
    "List all domains attached to a project (production + preview alias domains).",
    {
      idOrName: z.string().min(1),
    },
    async ({ idOrName }) => {
      const data = await vercelFetch(
        `/v9/projects/${encodeURIComponent(idOrName)}/domains`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_add_project_domain",
    "Add a custom domain to a project. After adding, point the domain's DNS at Vercel (A 76.76.21.21 or CNAME cname.vercel-dns.com) — pair with spaceship_point_to_vercel if registered on Spaceship.",
    {
      idOrName: z.string().min(1),
      domain: z.string().min(3),
      gitBranch: z
        .string()
        .optional()
        .describe(
          "If set, attach this domain to a specific branch instead of production.",
        ),
    },
    async ({ idOrName, domain, gitBranch }) => {
      const data = await vercelFetch(
        `/v10/projects/${encodeURIComponent(idOrName)}/domains`,
        { method: "POST", body: { name: domain, gitBranch } },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_remove_project_domain",
    "Remove a custom domain from a project. Does not delete the domain registration — just unlinks it from the project.",
    {
      idOrName: z.string().min(1),
      domain: z.string().min(3),
    },
    async ({ idOrName, domain }) => {
      const data = await vercelFetch(
        `/v9/projects/${encodeURIComponent(idOrName)}/domains/${encodeURIComponent(domain)}`,
        { method: "DELETE" },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
