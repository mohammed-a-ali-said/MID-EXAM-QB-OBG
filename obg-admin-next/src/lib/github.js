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

export async function fetchRepoQuestions(token) {
  const env = assertEnv();
  const url = `https://api.github.com/repos/${encodeURIComponent(env.repoOwner)}/${encodeURIComponent(env.repoName)}/contents/${env.repoPath}?ref=${encodeURIComponent(env.repoBranch)}`;
  const response = await githubFetch(url, token);
  const payload = await response.json();
  const content = Buffer.from(String(payload.content || ""), "base64").toString("utf8");
  const questions = JSON.parse(content);
  if (!Array.isArray(questions)) {
    throw new Error("Repository question bank is not a JSON array.");
  }
  return {
    questions,
    sha: payload.sha,
    repo: {
      owner: env.repoOwner,
      repo: env.repoName,
      branch: env.repoBranch,
      path: env.repoPath,
    },
  };
}

export async function saveRepoQuestions(token, { content, sha }) {
  const env = assertEnv();
  const url = `https://api.github.com/repos/${encodeURIComponent(env.repoOwner)}/${encodeURIComponent(env.repoName)}/contents/${env.repoPath}`;
  const response = await githubFetch(url, token, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "Update question bank from admin dashboard",
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
