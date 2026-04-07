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
    const body = await response.text();
    const error = new Error(`GitHub request failed (${response.status}): ${body}`);
    error.status = response.status;
    error.body = body;
    throw error;
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
    siteConfigPath: env.siteConfigPath,
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

async function fetchRepoFileSha(token, repoPath) {
  const env = assertEnv();
  const encodedPath = encodeRepoPath(repoPath);
  const url = `https://api.github.com/repos/${encodeURIComponent(env.repoOwner)}/${encodeURIComponent(env.repoName)}/contents/${encodedPath}?ref=${encodeURIComponent(env.repoBranch)}`;
  const response = await githubFetch(url, token);
  const payload = await response.json();
  return String(payload?.sha || "").trim();
}

async function listRepoDirectory(token, repoPath) {
  const env = assertEnv();
  const encodedPath = encodeRepoPath(repoPath);
  const url = `https://api.github.com/repos/${encodeURIComponent(env.repoOwner)}/${encodeURIComponent(env.repoName)}/contents/${encodedPath}?ref=${encodeURIComponent(env.repoBranch)}`;
  const response = await githubFetch(url, token);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

async function saveRepoJsonFile(token, { repoPath, content, sha, message }) {
  const env = assertEnv();
  const encodedPath = encodeRepoPath(repoPath);
  const url = `https://api.github.com/repos/${encodeURIComponent(env.repoOwner)}/${encodeURIComponent(env.repoName)}/contents/${encodedPath}`;

  async function commitWithSha(currentSha) {
    const response = await githubFetch(url, token, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        branch: env.repoBranch,
        sha: currentSha,
        content: Buffer.from(content, "utf8").toString("base64"),
      }),
    });
    return response.json();
  }

  let effectiveSha = String(sha || "").trim();
  let payload;
  try {
    payload = await commitWithSha(effectiveSha);
  } catch (error) {
    if (error?.status !== 409) throw error;
    effectiveSha = await fetchRepoFileSha(token, repoPath);
    payload = await commitWithSha(effectiveSha);
  }

  return {
    sha: payload.content?.sha || "",
    commitSha: payload.commit?.sha || "",
    url: payload.commit?.html_url || "",
  };
}

async function saveRepoBase64File(token, { repoPath, base64Content, sha, message }) {
  const env = assertEnv();
  const encodedPath = encodeRepoPath(repoPath);
  const url = `https://api.github.com/repos/${encodeURIComponent(env.repoOwner)}/${encodeURIComponent(env.repoName)}/contents/${encodedPath}`;

  async function commitWithSha(currentSha) {
    const response = await githubFetch(url, token, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        branch: env.repoBranch,
        sha: currentSha || undefined,
        content: base64Content,
      }),
    });
    return response.json();
  }

  let effectiveSha = String(sha || "").trim();
  let payload;
  try {
    payload = await commitWithSha(effectiveSha);
  } catch (error) {
    if (error?.status !== 409) throw error;
    effectiveSha = await fetchRepoFileSha(token, repoPath).catch(() => "");
    payload = await commitWithSha(effectiveSha);
  }

  return {
    sha: payload.content?.sha || "",
    commitSha: payload.commit?.sha || "",
    url: payload.commit?.html_url || "",
    path: payload.content?.path || repoPath,
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
  const [questionsFile, metadataFile, siteConfigFile] = await Promise.all([
    fetchRepoJsonFile(token, env.repoPath, env.repoPath),
    fetchRepoJsonFile(token, env.metadataPath, env.metadataPath).catch(() => ({
      payload: { sha: "" },
      data: null,
    })),
    fetchRepoJsonFile(token, env.siteConfigPath, env.siteConfigPath).catch(() => ({
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
    siteConfig: siteConfigFile.data,
    siteConfigSha: siteConfigFile.payload?.sha || "",
    repo: repoContext(env),
  };
}

export async function saveRepoContent(token, { questionsContent, questionsSha, metadataContent, metadataSha, siteConfigContent, siteConfigSha }) {
  const env = assertEnv();
  const [questionsSaved, metadataSaved, siteConfigSaved] = await Promise.all([
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
    saveRepoJsonFile(token, {
      repoPath: env.siteConfigPath,
      content: siteConfigContent,
      sha: siteConfigSha,
      message: "Update site config from admin dashboard",
    }),
  ]);

  return {
    sha: questionsSaved.sha,
    metadataSha: metadataSaved.sha,
    siteConfigSha: siteConfigSaved.sha,
    commitSha: siteConfigSaved.commitSha || metadataSaved.commitSha || questionsSaved.commitSha,
    url: siteConfigSaved.url || metadataSaved.url || questionsSaved.url,
  };
}

export async function uploadRepoImage(token, { questionId, fileName, contentType, base64Content }) {
  const env = assertEnv();
  const safeQuestionId = String(questionId || "question").trim().replace(/[^a-z0-9_-]+/gi, "-") || "question";
  const safeName = String(fileName || "image").trim().replace(/[^a-z0-9._-]+/gi, "-") || "image";
  const extensionMatch = safeName.match(/(\.[a-z0-9]+)$/i);
  const mimeExtensionMap = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
  };
  const extension = extensionMatch?.[1]?.toLowerCase() || mimeExtensionMap[String(contentType || "").toLowerCase()] || ".png";
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const repoPath = `${String(env.imageBasePath || "images/questions").replace(/^\/+|\/+$/g, "")}/${safeQuestionId}-${timestamp}${extension}`;
  const saved = await saveRepoBase64File(token, {
    repoPath,
    base64Content,
    message: `Upload image for ${safeQuestionId} from admin dashboard`,
  });
  return {
    ...saved,
    repoPath,
    publicPath: repoPath,
  };
}

export async function listRepoImages(token) {
  const env = assertEnv();
  const entries = await listRepoDirectory(token, env.imageBasePath);
  return entries
    .filter((entry) => entry && entry.type === "file")
    .filter((entry) => /\.(png|jpe?g|webp|gif|svg)$/i.test(String(entry.name || "")))
    .map((entry) => ({
      name: String(entry.name || "").trim(),
      path: String(entry.path || "").trim(),
      sha: String(entry.sha || "").trim(),
      size: Number(entry.size || 0) || 0,
      downloadUrl: String(entry.download_url || "").trim(),
    }))
    .sort((left, right) => String(right.name || "").localeCompare(String(left.name || "")));
}
