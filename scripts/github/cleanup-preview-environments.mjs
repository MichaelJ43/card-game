#!/usr/bin/env node

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const keepCount = Number.parseInt(process.env.KEEP_PREVIEW_ENVIRONMENTS || "10", 10);
const dryRun = parseBoolean(process.env.DRY_RUN ?? "true");
const environmentPattern = /^preview-pr-\d+$/;

if (!repository || !repository.includes("/")) {
  fail("GITHUB_REPOSITORY must be set to owner/repo.");
}

if (!token) {
  fail("GITHUB_TOKEN or GH_TOKEN must be set.");
}

if (!Number.isInteger(keepCount) || keepCount < 0) {
  fail("KEEP_PREVIEW_ENVIRONMENTS must be a non-negative integer.");
}

const [owner, repo] = repository.split("/");
const apiBase = "https://api.github.com";

const previewEnvironments = (await listEnvironments()).filter((environment) =>
  environmentPattern.test(environment.name),
);

const candidates = [];
for (const environment of previewEnvironments) {
  candidates.push(await describePreviewEnvironment(environment));
}

candidates.sort((left, right) => compareDescending(left.sortDate, right.sortDate));

const kept = candidates.slice(0, keepCount);
const expired = candidates.slice(keepCount);
const deleted = [];
const skipped = [];

for (const candidate of expired) {
  if (candidate.latestStatus !== "inactive") {
    skipped.push({
      ...candidate,
      reason: candidate.latestStatus
        ? `latest deployment status is ${candidate.latestStatus}`
        : "no latest deployment status found",
    });
    continue;
  }

  if (dryRun) {
    skipped.push({ ...candidate, reason: "dry run" });
    continue;
  }

  await deleteEnvironment(candidate.name);
  deleted.push(candidate);
}

const summaryLines = [
  "### Preview environment cleanup",
  "",
  `- Mode: ${dryRun ? "dry run" : "delete"}`,
  `- Keep count: ${keepCount}`,
  `- Preview environments found: ${candidates.length}`,
  `- Kept as newest: ${kept.length}`,
  `- Deleted inactive environments: ${deleted.length}`,
  `- Skipped old environments: ${skipped.length}`,
  "",
  "#### Deleted",
  ...formatRows(deleted, "Deleted none."),
  "",
  "#### Skipped",
  ...formatRows(skipped, "Skipped none."),
];

console.log(summaryLines.join("\n"));

if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then(({ appendFile }) =>
    appendFile(process.env.GITHUB_STEP_SUMMARY, `${summaryLines.join("\n")}\n`),
  );
}

async function listEnvironments() {
  const environments = [];
  for (let page = 1; ; page += 1) {
    const response = await githubApi(`/repos/${owner}/${repo}/environments`, {
      searchParams: { per_page: "100", page: String(page) },
    });
    environments.push(...(response.environments || []));
    if (environments.length >= response.total_count || (response.environments || []).length === 0) {
      return environments;
    }
  }
}

async function describePreviewEnvironment(environment) {
  const deployments = await githubApi(`/repos/${owner}/${repo}/deployments`, {
    searchParams: { environment: environment.name, per_page: "1" },
  });
  const latestDeployment = deployments[0] || null;
  const statuses = latestDeployment
    ? await githubApi(`/repos/${owner}/${repo}/deployments/${latestDeployment.id}/statuses`, {
        searchParams: { per_page: "1" },
      })
    : [];
  const latestStatus = statuses[0] || null;

  return {
    name: environment.name,
    environmentUpdatedAt: environment.updated_at,
    latestDeploymentId: latestDeployment?.id ?? null,
    latestDeploymentCreatedAt: latestDeployment?.created_at ?? null,
    latestStatus: latestStatus?.state ?? null,
    latestStatusCreatedAt: latestStatus?.created_at ?? null,
    sortDate: latestStatus?.created_at || latestDeployment?.created_at || environment.updated_at,
  };
}

async function deleteEnvironment(name) {
  await githubApi(`/repos/${owner}/${repo}/environments/${encodeURIComponent(name)}`, {
    method: "DELETE",
    okStatuses: [204],
  });
}

async function githubApi(path, options = {}) {
  const url = new URL(`${apiBase}${path}`);
  for (const [key, value] of Object.entries(options.searchParams || {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  const okStatuses = options.okStatuses || [200];
  if (!okStatuses.includes(response.status)) {
    const body = await response.text();
    throw new Error(`${options.method || "GET"} ${path} failed with ${response.status}: ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function compareDescending(left, right) {
  return new Date(right).getTime() - new Date(left).getTime();
}

function formatRows(rows, emptyText) {
  if (rows.length === 0) {
    return [`- ${emptyText}`];
  }

  return rows.map((row) => {
    const status = row.latestStatus || "unknown";
    const reason = row.reason ? ` (${row.reason})` : "";
    return `- ${row.name}: ${status}${reason}`;
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
