import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { vercelFetch, VercelApiError } from "../client.js";

type StepResult = {
  step: string;
  ok: boolean;
  detail?: unknown;
  error?: string;
};

type Finding = {
  priority: "critical" | "high" | "medium" | "low";
  area: "deployment" | "env_vars" | "domains" | "git" | "framework" | "aliases";
  title: string;
  detail: string;
  remediation?: string;
};

type NotifyFn = (message: string, progress: number, total: number) => void;

async function safe<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<StepResult & { value?: T }> {
  try {
    const value = await fn();
    return { step: label, ok: true, value, detail: value };
  } catch (err) {
    if (err instanceof VercelApiError) {
      return {
        step: label,
        ok: false,
        error: `HTTP ${err.status}: ${err.message}`,
        detail: err.body,
      };
    }
    return {
      step: label,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

type EnvVar = {
  id?: string;
  key?: string;
  target?: string[] | string;
  type?: string;
  gitBranch?: string;
};

type Deployment = {
  uid?: string;
  url?: string;
  name?: string;
  state?: string;
  target?: string | null;
  readyState?: string;
  createdAt?: number;
  ready?: number;
};

function asList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.envs)) return obj.envs;
    if (Array.isArray(obj.deployments)) return obj.deployments;
    if (Array.isArray(obj.projects)) return obj.projects;
    if (Array.isArray(obj.domains)) return obj.domains;
    if (Array.isArray(obj.aliases)) return obj.aliases;
  }
  return [];
}

function envTargets(e: EnvVar): Set<string> {
  const t = e.target;
  if (Array.isArray(t)) return new Set(t);
  if (typeof t === "string") return new Set([t]);
  return new Set();
}

export function registerCompositeTools(server: McpServer) {
  server.tool(
    "vercel_project_audit",
    "Composite audit of a Vercel project. Fetches project + recent deployments + env vars + domains in parallel, detects drift (e.g. env var in preview but not prod, stale production deployment, unverified domain), and returns a branching recommendation tree. Set `streaming: true` with a progressToken to stream step-by-step progress.",
    {
      idOrName: z.string().min(1).describe("Project ID or name."),
      stalenessHours: z
        .number()
        .int()
        .min(1)
        .max(24 * 365)
        .default(24 * 30)
        .describe(
          "How old the latest production deployment can be before flagged stale. Default 30 days.",
        ),
      streaming: z
        .boolean()
        .default(false)
        .describe(
          "Emit MCP progress notifications per-step. Caller must supply a progressToken in _meta to receive them.",
        ),
    },
    async ({ idOrName, stalenessHours, streaming }, extra) => {
      const progressToken = extra?._meta?.progressToken as
        | string
        | number
        | undefined;
      const shouldStream = streaming && progressToken !== undefined;
      const TOTAL = 5;

      const notify: NotifyFn = (message, progress, total) => {
        if (!shouldStream) return;
        void extra
          .sendNotification({
            method: "notifications/progress",
            params: {
              progressToken: progressToken!,
              progress,
              total,
              message,
            },
          })
          .catch(() => {});
      };

      notify(`loading ${idOrName}`, 0, TOTAL);

      const [projectRes, deploysRes, envsRes, domainsRes] = await Promise.all([
        safe("project", () =>
          vercelFetch(`/v9/projects/${encodeURIComponent(idOrName)}`),
        ),
        safe("deployments", () =>
          vercelFetch("/v6/deployments", {
            query: { projectId: idOrName, limit: 20 },
          }),
        ),
        safe("env_vars", () =>
          vercelFetch(`/v10/projects/${encodeURIComponent(idOrName)}/env`),
        ),
        safe("domains", () =>
          vercelFetch(`/v9/projects/${encodeURIComponent(idOrName)}/domains`),
        ),
      ]);

      const steps: StepResult[] = [projectRes, deploysRes, envsRes, domainsRes];
      notify("fan-out complete, analyzing", 4, TOTAL);

      const findings: Finding[] = [];

      // Branch 0: can't find project at all → short-circuit
      if (!projectRes.ok) {
        findings.push({
          priority: "critical",
          area: "framework",
          title: "project not found",
          detail: projectRes.error ?? "unknown error",
          remediation: `verify '${idOrName}' exists in this team — list via vercel_list_projects.`,
        });
        notify("done (project missing)", TOTAL, TOTAL);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { idOrName, healthy: false, score: 0, steps, findings },
                null,
                2,
              ),
            },
          ],
        };
      }

      const project = (projectRes as StepResult & { value?: unknown }).value as
        | Record<string, unknown>
        | undefined;
      const deploys = asList(
        (deploysRes as StepResult & { value?: unknown }).value,
      ) as Deployment[];
      const envs = asList(
        (envsRes as StepResult & { value?: unknown }).value,
      ) as EnvVar[];
      const domains = asList(
        (domainsRes as StepResult & { value?: unknown }).value,
      ) as Array<Record<string, unknown>>;

      // Branch 1: deployment staleness + health
      const prodDeploys = deploys.filter(
        (d) => d.target === "production" || d.target === "PRODUCTION",
      );
      const latestProd = prodDeploys
        .slice()
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
      if (!latestProd) {
        findings.push({
          priority: "high",
          area: "deployment",
          title: "no production deployment",
          detail:
            "project has no production deployment in the last 20 records.",
          remediation:
            "trigger a production deploy via vercel CLI or git push.",
        });
      } else {
        const ageMs = Date.now() - (latestProd.createdAt ?? 0);
        const ageHours = ageMs / (1000 * 60 * 60);
        if (ageHours > stalenessHours) {
          findings.push({
            priority: "medium",
            area: "deployment",
            title: "stale production deployment",
            detail: `latest prod deploy is ~${Math.round(ageHours)}h old (url: ${latestProd.url ?? latestProd.uid ?? "?"}).`,
            remediation:
              "consider redeploying to pick up dependency updates or verifying the project is still active.",
          });
        }
        const failedStates = ["ERROR", "CANCELED", "FAILED"];
        if (
          latestProd.state &&
          failedStates.includes(String(latestProd.state).toUpperCase())
        ) {
          findings.push({
            priority: "critical",
            area: "deployment",
            title: "latest production deployment failed",
            detail: `state=${latestProd.state} id=${latestProd.uid ?? latestProd.url}`,
            remediation:
              "check vercel_get_deployment_logs on the deployment and redeploy.",
          });
        }
      }

      // Branch 2: env var drift — keys in one target but not another
      const envByKey = new Map<string, EnvVar[]>();
      for (const e of envs) {
        if (!e.key) continue;
        const list = envByKey.get(e.key) ?? [];
        list.push(e);
        envByKey.set(e.key, list);
      }
      for (const [key, list] of envByKey) {
        const union = new Set<string>();
        for (const e of list) for (const t of envTargets(e)) union.add(t);
        const inProd = union.has("production");
        const inPreview = union.has("preview");
        const inDev = union.has("development");
        if (inPreview && !inProd) {
          findings.push({
            priority: "high",
            area: "env_vars",
            title: `env var '${key}' missing in production`,
            detail:
              "present in preview but not production — prod deploys will fail at runtime if this is required.",
            remediation:
              "add the same value to production via vercel_create_env_var.",
          });
        } else if (inProd && !inPreview) {
          findings.push({
            priority: "low",
            area: "env_vars",
            title: `env var '${key}' missing in preview`,
            detail:
              "present in production but not preview — PR previews may diverge.",
          });
        }
        if (!inProd && !inPreview && inDev) {
          findings.push({
            priority: "medium",
            area: "env_vars",
            title: `env var '${key}' only in development`,
            detail:
              "will not propagate to preview or production — deploys will run without it.",
          });
        }
      }

      // Branch 3: domains — unverified or no custom domain
      let unverifiedCount = 0;
      let customCount = 0;
      for (const d of domains) {
        const name = String(d.name ?? d.domain ?? "");
        const verified = d.verified !== false;
        const isVercelDomain = name.endsWith(".vercel.app");
        if (!isVercelDomain) customCount++;
        if (!verified) {
          unverifiedCount++;
          findings.push({
            priority: "high",
            area: "domains",
            title: `domain '${name}' unverified`,
            detail:
              "DNS verification incomplete — traffic to this domain won't reach the project.",
            remediation:
              "check DNS records, run spaceship_point_to_vercel if registered on Spaceship.",
          });
        }
      }
      if (customCount === 0) {
        findings.push({
          priority: "low",
          area: "domains",
          title: "no custom domain attached",
          detail: "project only exposes .vercel.app subdomain.",
          remediation:
            "attach a domain via vercel_add_project_domain once DNS is set.",
        });
      }

      // Branch 4: git linkage
      const link = project?.link as Record<string, unknown> | undefined;
      if (!link || typeof link !== "object") {
        findings.push({
          priority: "medium",
          area: "git",
          title: "project not linked to git",
          detail: "deploys cannot be triggered by git push.",
        });
      }

      notify("ranking findings", TOTAL, TOTAL);

      const priorityRank: Record<Finding["priority"], number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      findings.sort(
        (a, b) => priorityRank[a.priority] - priorityRank[b.priority],
      );

      const score =
        100 -
        findings.reduce((acc, f) => {
          if (f.priority === "critical") return acc + 35;
          if (f.priority === "high") return acc + 15;
          if (f.priority === "medium") return acc + 7;
          return acc + 2;
        }, 0);

      const healthy = !findings.some(
        (f) => f.priority === "critical" || f.priority === "high",
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                idOrName,
                healthy,
                score: Math.max(0, score),
                summary: {
                  deploymentCount: deploys.length,
                  productionDeploymentCount: prodDeploys.length,
                  envVarCount: envs.length,
                  domainCount: domains.length,
                  unverifiedDomains: unverifiedCount,
                  customDomains: customCount,
                  gitLinked: !!link,
                },
                findings,
                steps,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
