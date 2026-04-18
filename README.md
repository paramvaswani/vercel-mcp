# vercel-mcp-server

MCP server for the Vercel REST API. Lets Claude inspect deployments, manage projects, attach domains, set env vars, and read build logs without leaving the chat.

## Tools

| Tool                           | What it does                                                   | Side effects             |
| ------------------------------ | -------------------------------------------------------------- | ------------------------ |
| `vercel_list_deployments`      | List deployments (filter by project, target, time)             | none                     |
| `vercel_get_deployment`        | Single deployment details by ID or URL                         | none                     |
| `vercel_get_deployment_logs`   | Build + runtime logs                                           | none                     |
| `vercel_cancel_deployment`     | Cancel an in-progress deployment                               | stops build              |
| `vercel_delete_deployment`     | Delete a deployment (dry-run unless confirm)                   | irreversible (confirmed) |
| `vercel_list_projects`         | List projects                                                  | none                     |
| `vercel_get_project`           | Project details                                                | none                     |
| `vercel_list_project_domains`  | Domains attached to project                                    | none                     |
| `vercel_add_project_domain`    | Attach a custom domain                                         | DNS still required       |
| `vercel_remove_project_domain` | Unlink a custom domain (registration not deleted)              | unlinks                  |
| `vercel_list_env_vars`         | List env vars (decrypt opt-in)                                 | none                     |
| `vercel_create_env_var`        | Create / upsert env var                                        | env change               |
| `vercel_delete_env_var`        | Delete env var by ID                                           | env change               |
| `vercel_promote_to_production` | Alias prod domains at a specific deployment (instant rollback) | prod alias change        |
| `vercel_list_aliases`          | List project aliases                                           | none                     |

## Setup

1. Generate a personal access token at https://vercel.com/account/tokens.
2. Optional: grab your team ID from team settings if you want to scope to a team rather than personal.
3. Install:
   ```bash
   pnpm install
   pnpm build
   ```
4. Add to your Claude Code MCP config (`~/.claude.json`):
   ```jsonc
   "mcpServers": {
     "vercel": {
       "command": "node",
       "args": ["/absolute/path/to/vercel-mcp/dist/index.js"],
       "env": {
         "VERCEL_TOKEN": "...",
         "VERCEL_TEAM_ID": "team_..." // optional
       }
     }
   }
   ```
5. Restart Claude Code.

## Smoke test

```bash
export VERCEL_TOKEN=...
pnpm smoke
```

Hits `list_projects` and `list_deployments` and prints results.

## Pairs with

- **spaceship-mcp** — register a domain on Spaceship, then `vercel_add_project_domain` to attach it, then `spaceship_point_to_vercel` to wire DNS. Three tools, one prompt.

## Auth

`Authorization: Bearer $VERCEL_TOKEN`. Team-scoped requests append `?teamId=...` automatically when `VERCEL_TEAM_ID` is set.

## License

MIT.
