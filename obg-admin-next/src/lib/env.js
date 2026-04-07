const required = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "SESSION_SECRET"];

function read(key, fallback = "") {
  return String(process.env[key] || fallback).trim();
}

export function getEnv() {
  const env = {
    githubClientId: read("GITHUB_CLIENT_ID"),
    githubClientSecret: read("GITHUB_CLIENT_SECRET"),
    sessionSecret: read("SESSION_SECRET"),
    repoOwner: read("GITHUB_REPO_OWNER", "mohammed-a-ali-said"),
    repoName: read("GITHUB_REPO_NAME", "MID-EXAM-QB-OBG"),
    repoBranch: read("GITHUB_REPO_BRANCH", "main"),
    repoPath: read("GITHUB_REPO_PATH", "data/questions.json"),
    metadataPath: read("GITHUB_METADATA_PATH", "data/content-metadata.json"),
    siteConfigPath: read("GITHUB_SITE_CONFIG_PATH", "data/site-config.json"),
    imageBasePath: read("GITHUB_IMAGE_BASE_PATH", "images/questions"),
    oauthScope: read("GITHUB_OAUTH_SCOPE", "public_repo"),
    allowedUsers: read("ADMIN_ALLOWED_USERS", "mohammed-a-ali-said")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  };

  const missing = required.filter((key) => !read(key));
  return { ...env, missing };
}

export function assertEnv() {
  const env = getEnv();
  if (env.missing.length) {
    throw new Error(`Missing required environment variables: ${env.missing.join(", ")}`);
  }
  return env;
}
