import { assertEnv } from "@/lib/env";

async function githubFetch(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "obg-admin-next",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}): ${await response.text()}`);
  }

  return response;
}

function encodeRepoPath(path) {
  return String(path || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function readContentsPayloadText(payload, token, fallbackLabel) {
  const embedded = String(payload?.content || "").trim();
  if (embedded) {
    return Buffer.from(embedded, "base64").toString("utf8");
  }

  const downloadUrl = String(payload?.download_url || "").trim();
  if (downloadUrl) {
    const response = await fetch(downloadUrl, {
      headers: {
        Accept: "application/json,text/plain,*/*",
        Authorization: `Bearer ${token}`,
        "User-Agent": "obg-admin-next",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`GitHub raw download failed (${response.status}): ${await response.text()}`);
    }
    return response.text();
  }

  const gitUrl = String(payload?.git_url || "").trim();
  if (gitUrl) {
    const response = await githubFetch(gitUrl, token);
    const blob = await response.json();
    const blobContent = String(blob?.content || "").trim();
    if (blobContent) {
      return Buffer.from(blobContent, "base64").toString("utf8");
    }
  }

  throw new Error(`GitHub did not return file content for ${fallbackLabel}.`);
}

function repoContext(env) {
  return {
    owner: env.repoOwner,
    repo: env.repoName,
    branch: env.repoBranch,
    path: env.repoPath,
    metadataPath: env.metadataPath,
  };
}

async function fetchRepoJsonFile(token, repoPath, label) {
  const env = assertEnv();
  const encodedPath = encodeRepoPath(repoPath);
  const url = `https://api.github.com/repos/${encodeURIComponent(env.repoOwner)}/${encodeURIComponent(env.repoName)}/contents/${encodedPath}?ref=${encodeURIComponent(env.repoBranch)}`;
  const response = await githubFetch(url, token);
  const payload = await response.json();
  const content = await readContentsPayloadText(payload, token, label);
  return {
    payload,
    data: JSON.parse(content),
  };
}

async function saveRepoJsonFile(token, { repoPath, content, sha, message }) {
  const env = assertEnv();
  const encodedPath = encodeRepoPath(repoPath);
  const url = `https://api.github.com/repos/${encodeURIComponent(env.repoOwner)}/${encodeURIComponent(env.repoName)}/contents/${encodedPath}`;
  const response = await githubFetch(url, token, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      branch: env.repoBranch,
      sha,
      content: Buffer.from(content, "utf8").toString("base64"),
    }),
  });
  const payload = await response.json();
  return {
    sha: payload.content?.sha || "",
    commitSha: payload.commit?.sha || "",
    url: payload.commit?.html_url || "",
  };
}

export async function exchangeCodeForToken({ code, redirectUri }) {
  const env = assertEnv();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "obg-admin-next",
    },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed (${response.status})`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error_description || payload.error);
  }
  if (!payload.access_token) {
    throw new Error("GitHub token exchange did not return an access token.");
  }
  return payload.access_token;
}

export async function fetchViewer(token) {
  const response = await githubFetch("https://api.github.com/user", token);
  return response.json();
}

export async function fetchRepoContent(token) {
  const env = assertEnv();
  const [questionsFile, metadataFile] = await Promise.all([
    fetchRepoJsonFile(token, env.repoPath, env.repoPath),
    fetchRepoJsonFile(token, env.metadataPath, env.metadataPath).catch(() => ({
      payload: { sha: "" },
      data: null,
    })),
  ]);

  if (!Array.isArray(questionsFile.data)) {
    throw new Error("Repository question bank is not a JSON array.");
  }

  return {
    questions: questionsFile.data,
    sha: questionsFile.payload.sha,
    metadata: metadataFile.data,
    metadataSha: metadataFile.payload?.sha || "",
    repo: repoContext(env),
  };
}

export async function saveRepoContent(token, { questionsContent, questionsSha, metadataContent, metadataSha }) {
  const env = assertEnv();
  const [questionsSaved, metadataSaved] = await Promise.all([
    saveRepoJsonFile(token, {
      repoPath: env.repoPath,
      content: questionsContent,
      sha: questionsSha,
      message: "Update question bank from admin dashboard",
    }),
    saveRepoJsonFile(token, {
      repoPath: env.metadataPath,
      content: metadataContent,
      sha: metadataSha,
      message: "Update content metadata from admin dashboard",
    }),
  ]);

  return {
    sha: questionsSaved.sha,
    metadataSha: metadataSaved.sha,
    commitSha: metadataSaved.commitSha || questionsSaved.commitSha,
    url: metadataSaved.url || questionsSaved.url,
  };
}
