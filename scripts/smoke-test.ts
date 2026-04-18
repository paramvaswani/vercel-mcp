#!/usr/bin/env tsx
import { vercelFetch, VercelApiError } from "../src/client.js";

const steps = [
  {
    name: "list_projects",
    run: () => vercelFetch("/v9/projects", { query: { limit: 5 } }),
  },
  {
    name: "list_deployments",
    run: () => vercelFetch("/v6/deployments", { query: { limit: 5 } }),
  },
];

async function main() {
  if (!process.env.VERCEL_TOKEN) {
    console.error(
      "Set VERCEL_TOKEN. Generate at https://vercel.com/account/tokens",
    );
    process.exit(1);
  }
  let pass = 0;
  let fail = 0;
  for (const s of steps) {
    try {
      const t0 = Date.now();
      const r = await s.run();
      pass++;
      console.log(`PASS ${s.name} (${Date.now() - t0}ms)`);
      console.log(JSON.stringify(r, null, 2).slice(0, 500));
    } catch (err) {
      fail++;
      const msg =
        err instanceof VercelApiError
          ? `${err.status}: ${err.message}`
          : String(err);
      console.log(`FAIL ${s.name} — ${msg}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
