import { appendFileSync } from "fs";

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
  FORCE_SLOT: forceSlotInput = "",
  STAGING_SLOT_COUNT: slotCountInput = "3",
} = process.env;

// Only these Nstaging.markee.xyz domains are set up (DNS + Vercel). The script never creates
// domains: when every slot is held by a live branch it reports that instead, so someone can prune
// a branch or take a slot over (workflow_dispatch with FORCE_SLOT).
const slotCount = Number(slotCountInput);
if (!Number.isInteger(slotCount) || slotCount < 1) {
  throw new Error(`STAGING_SLOT_COUNT must be a positive integer, got "${slotCountInput}"`);
}
const forceSlot = forceSlotInput ? Number(forceSlotInput) : null;
if (forceSlot !== null && !(Number.isInteger(forceSlot) && forceSlot >= 1 && forceSlot <= slotCount)) {
  throw new Error(`FORCE_SLOT must be between 1 and ${slotCount}, got "${forceSlotInput}"`);
}

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
    // Vercel's domain PATCH rejects an empty string for gitBranch ("Invalid `gitBranch`
    // property") -- null is what actually clears it back to unassigned.
    await updateDomain(domain.name, null);
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

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) appendFileSync(outputFile, `${name}=${value}\n`);
}

const usableDomains = stagingDomains.filter((domain) => domain.slot <= slotCount);
for (const domain of stagingDomains) {
  if (domain.slot > slotCount) {
    console.log(`Ignoring ${domain.name}: only slots 1-${slotCount} are set up (STAGING_SLOT_COUNT)`);
  }
}
for (let slot = 1; slot <= slotCount; slot += 1) {
  if (!usableDomains.some((domain) => domain.slot === slot)) {
    console.log(`${slot}staging.${baseDomain} is not a domain on the Vercel project; skipping it`);
  }
}

async function assign(domain) {
  // A branch holds one slot: let go of any other it had (e.g. when taking a different one over).
  for (const other of stagingDomains) {
    if (other.gitBranch === branchName && other.name !== domain.name) {
      await updateDomain(other.name, null);
      console.log(`Released ${other.name} from ${branchName}`);
    }
  }
  if (domain.gitBranch !== branchName) {
    await updateDomain(domain.name, branchName);
    const previous = domain.gitBranch ? ` (was ${domain.gitBranch})` : "";
    console.log(`Assigned https://${domain.name} to ${branchName}${previous}`);
  }
  setOutput("assigned_domain", domain.name);
}

if (forceSlot !== null) {
  if (!(await githubBranchExists(branchName))) throw new Error(`Branch ${branchName} does not exist`);
  const target = usableDomains.find((domain) => domain.slot === forceSlot);
  if (!target) throw new Error(`${forceSlot}staging.${baseDomain} is not a domain on the Vercel project`);
  await assign(target);
  process.exit(0);
}

const existingAssignment = usableDomains.find((domain) => domain.gitBranch === branchName);
if (existingAssignment) {
  console.log(`${branchName} already uses https://${existingAssignment.name}`);
  setOutput("assigned_domain", existingAssignment.name);
  process.exit(0);
}

let available;
for (const domain of usableDomains) {
  if (!domain.gitBranch) {
    available = domain;
    break;
  }
  if (!(await githubBranchExists(domain.gitBranch))) {
    console.log(`${domain.name} is reusable because ${domain.gitBranch} no longer exists`);
    available = domain;
    break;
  }
}

if (available) {
  await assign(available);
} else {
  const holders = usableDomains.map((domain) => `${domain.name} (${domain.gitBranch})`).join(", ");
  console.log(`::warning::All staging slots are taken: ${holders}. Prune a branch or take a slot over.`);
  setOutput("slots_full", "true");
  setOutput("slot_holders", holders);
}
