import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { vercelFetch } from "../client.js";

const TARGETS = ["production", "preview", "development"] as const;
const TYPES = ["plain", "secret", "encrypted", "system"] as const;

export function registerEnvTools(server: McpServer) {
  server.tool(
    "vercel_list_env_vars",
    "List all environment variables for a project. Returns key + target + type + (decrypted value if `decrypt: true`). Decryption requires elevated token scope.",
    {
      idOrName: z.string().min(1),
      decrypt: z.boolean().default(false),
    },
    async ({ idOrName, decrypt }) => {
      const data = await vercelFetch(
        `/v10/projects/${encodeURIComponent(idOrName)}/env`,
        { query: { decrypt: decrypt ? "true" : undefined } },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_create_env_var",
    "Create or upsert an environment variable on a project. Pass `targets` to scope it (production / preview / development).",
    {
      idOrName: z.string().min(1),
      key: z
        .string()
        .min(1)
        .regex(/^[A-Z0-9_]+$/i, "Use SHOUTY_SNAKE_CASE."),
      value: z.string(),
      type: z.enum(TYPES).default("encrypted"),
      targets: z.array(z.enum(TARGETS)).min(1).default(["production"]),
      gitBranch: z
        .string()
        .optional()
        .describe("Scope to a specific git branch (preview-target only)."),
      upsert: z
        .boolean()
        .default(true)
        .describe("Overwrite if a variable with the same key already exists."),
    },
    async (args) => {
      const data = await vercelFetch(
        `/v10/projects/${encodeURIComponent(args.idOrName)}/env`,
        {
          method: "POST",
          query: { upsert: args.upsert ? "true" : "false" },
          body: {
            key: args.key,
            value: args.value,
            type: args.type,
            target: args.targets,
            gitBranch: args.gitBranch,
          },
        },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    "vercel_delete_env_var",
    "Delete a single env var by ID. Use vercel_list_env_vars first to find the ID.",
    {
      idOrName: z.string().min(1),
      envVarId: z.string().min(1),
    },
    async ({ idOrName, envVarId }) => {
      const data = await vercelFetch(
        `/v9/projects/${encodeURIComponent(idOrName)}/env/${encodeURIComponent(envVarId)}`,
        { method: "DELETE" },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
