const requiredEnvironment = [
  "GITHUB_REPOSITORY",
  "GITHUB_TOKEN",
  "VERCEL_TOKEN",
  "VERCEL_PROJECT_ID",
  "VERCEL_ORG_ID",
  "BRANCH_NAME",
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const {
  BRANCH_NAME: branchName,
  GITHUB_REPOSITORY: githubRepository,
  GITHUB_TOKEN: githubToken,
  SLOT_ACTION: action = "assign",
  VERCEL_PROJECT_ID: vercelProjectId,
  VERCEL_ORG_ID: vercelOrgId,
  VERCEL_TOKEN: vercelToken,
} = process.env;

const baseDomain = "markee.xyz";
const stagingDomainPattern = /^([1-9]\d*)staging\.markee\.xyz$/;
const vercelApi = process.env.VERCEL_API_URL ?? "https://api.vercel.com";
const githubApi = process.env.GITHUB_API_URL ?? "https://api.github.com";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? text;
    throw new Error(`${options.method ?? "GET"} ${url} failed (${response.status}): ${message}`);
  }

  return body;
}

function projectDomainUrl(domain) {
  const path = `/v9/projects/${encodeURIComponent(vercelProjectId)}/domains`;
  const suffix = domain ? `/${encodeURIComponent(domain)}` : "";
  const url = new URL(`${vercelApi}${path}${suffix}`);
  url.searchParams.set("teamId", vercelOrgId);
  return url;
}

function vercelOptions(method = "GET", body) {
  return {
    method,
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

async function listProjectDomains() {
  const domains = [];
  let until;

  do {
    const url = projectDomainUrl();
    url.searchParams.set("limit", "100");
    if (until) url.searchParams.set("until", String(until));

    const result = await requestJson(url, vercelOptions());
    domains.push(...(result.domains ?? []));
    until = result.pagination?.next;
  } while (until);

  return domains;
}

async function githubBranchExists(candidateBranch) {
  const url = `${githubApi}/repos/${githubRepository}/git/ref/heads/${encodeURIComponent(candidateBranch)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Could not check GitHub branch ${candidateBranch} (${response.status})`);
  }
  return true;
}

async function updateDomain(domain, gitBranch) {
  return requestJson(
    projectDomainUrl(domain),
    vercelOptions("PATCH", { gitBranch }),
  );
}

async function addDomain(domain, gitBranch) {
  const url = new URL(
    `${vercelApi}/v10/projects/${encodeURIComponent(vercelProjectId)}/domains`,
  );
  url.searchParams.set("teamId", vercelOrgId);
  return requestJson(url, vercelOptions("POST", { name: domain, gitBranch }));
}

const stagingDomains = (await listProjectDomains())
  .map((domain) => {
    const match = domain.name.match(stagingDomainPattern);
    return match ? { ...domain, slot: Number(match[1]) } : null;
  })
  .filter(Boolean)
  .sort((left, right) => left.slot - right.slot);

if (stagingDomains.length === 0) {
  console.log("No Nstaging.markee.xyz project domains exist yet");
} else {
  console.log("Current staging domain assignments:");
  for (const domain of stagingDomains) {
    console.log(`- ${domain.name}: ${domain.gitBranch || "available"}`);
  }
}

if (action === "release") {
  const assignedDomains = stagingDomains.filter(
    (domain) => domain.gitBranch === branchName,
  );

  for (const domain of assignedDomains) {
    await updateDomain(domain.name, "");
    console.log(`Released ${domain.name} from deleted branch ${branchName}`);
  }

  if (assignedDomains.length === 0) {
    console.log(`No staging domain was assigned to deleted branch ${branchName}`);
  }
  process.exit(0);
}

if (action !== "assign") {
  throw new Error(`Unsupported SLOT_ACTION: ${action}`);
}

const existingAssignment = stagingDomains.find(
  (domain) => domain.gitBranch === branchName,
);

if (existingAssignment) {
  console.log(`${branchName} already uses https://${existingAssignment.name}`);
  process.exit(0);
}

const availableSlots = new Set();
const domainsBySlot = new Map(stagingDomains.map((domain) => [domain.slot, domain]));

for (const domain of stagingDomains) {
  if (!domain.gitBranch) {
    availableSlots.add(domain.slot);
    continue;
  }

  if (!(await githubBranchExists(domain.gitBranch))) {
    console.log(`${domain.name} is reusable because ${domain.gitBranch} no longer exists`);
    availableSlots.add(domain.slot);
  }
}

let slot = 1;
while (domainsBySlot.has(slot) && !availableSlots.has(slot)) slot += 1;

const domainName = `${slot}staging.${baseDomain}`;
const existingDomain = domainsBySlot.get(slot);

if (existingDomain) {
  await updateDomain(domainName, branchName);
  console.log(`Reassigned https://${domainName} to ${branchName}`);
} else {
  const result = await addDomain(domainName, branchName);
  if (result.verified === false) {
    throw new Error(
      `${domainName} was added but Vercel requires domain verification before it can be used`,
    );
  }
  console.log(`Assigned new domain https://${domainName} to ${branchName}`);
}
