import { getSession } from "@/lib/session";
import Script from "next/script";

function LoginView({ error }) {
  const messageMap = {
    oauth_state: "The GitHub login state check failed. Please try again.",
    oauth_failed: "GitHub login failed. Check your OAuth app settings and callback URL.",
    unauthorized: "Your GitHub account is not on the admin allowlist.",
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "32px" }}>
      <div style={{ maxWidth: 680, width: "100%", background: "#fff", borderRadius: 24, padding: 32, boxShadow: "0 16px 48px rgba(27,58,107,.12)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#1A6B5A" }}>Protected Admin</div>
        <h1 style={{ margin: "10px 0 12px", fontSize: 42, color: "#1B3A6B", lineHeight: 1.1 }}>OBG Content Dashboard</h1>
        <p style={{ margin: 0, color: "#556274", lineHeight: 1.8 }}>
          This editor is protected by GitHub OAuth and writes directly to <code>data/questions.json</code> in your repository.
        </p>
        {error ? (
          <div style={{ marginTop: 18, padding: "12px 14px", borderRadius: 12, background: "#fff4f4", color: "#991b1b", border: "1px solid #f1c8c8" }}>
            {messageMap[error] || "Login failed. Please try again."}
          </div>
        ) : null}
        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/api/auth/login" style={{ textDecoration: "none", background: "#1B3A6B", color: "#fff", padding: "12px 18px", borderRadius: 12, fontWeight: 700 }}>
            Continue with GitHub
          </a>
        </div>
      </div>
    </main>
  );
}

function SettingsView({ user }) {
  return (
    <>
      <link rel="stylesheet" href="/admin/editor.css" />
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <div className="admin-kicker">Protected GitHub Admin</div>
            <h1>Website Settings</h1>
            <p>Manage the public website behavior separately from the question editor.</p>
          </div>
          <div className="header-actions">
            <a className="btn btn-ghost" href="/api/auth/logout">Sign out</a>
            <button className="btn btn-ghost" id="settings-theme-toggle-btn" type="button">Dark mode</button>
            <button className="btn btn-primary" id="settings-save-btn" type="button">Save to GitHub</button>
          </div>
        </header>

        <main className="settings-page-main">
          <aside className="panel">
            <div className="panel-title">Navigate</div>
            <nav className="admin-side-nav">
              <a className="admin-side-link" href="/">Question Editor</a>
              <a className="admin-side-link active" href="/settings">Website Settings</a>
            </nav>
            <div className="panel-title">Signed in as</div>
            <div className="github-help" style={{ fontWeight: 800, color: "#1B3A6B", fontSize: ".95rem" }}>{user.name || user.login}</div>
            <div className="github-help">@{user.login}</div>
          </aside>

          <section className="settings-main-panel">
            <div className="settings-card">
              <h2>Offline Downloads</h2>
              <p>Control whether students can download the public GitHub Pages site for offline use.</p>
            </div>

            <div className="settings-card">
              <div className="website-settings-card">
                <div className="website-settings-grid">
                  <label className="toggle-label bulk-toggle">
                    <span>Allow students to download offline mode</span>
                    <input id="site-offline-enabled" type="checkbox" />
                  </label>
                  <label>
                    Offline version
                    <div className="inline-create">
                      <input id="site-offline-version" type="text" placeholder="v1" />
                      <button className="mini-btn" id="bump-offline-version-btn" type="button">Bump</button>
                    </div>
                  </label>
                  <div className="website-field-span-full">
                    <div className="website-choice-heading">When turning offline off</div>
                    <div className="website-choice-group" id="site-offline-disable-mode-group">
                      <label className="website-choice-card">
                        <input name="site-offline-disable-mode" type="radio" value="keep_existing" defaultChecked />
                        <span className="website-choice-body">
                          <span className="website-choice-title">Keep downloaded copies</span>
                          <span className="website-choice-copy">Students who already downloaded the bank keep using it offline. New downloads and updates stay off.</span>
                        </span>
                      </label>
                      <label className="website-choice-card">
                        <input name="site-offline-disable-mode" type="radio" value="purge_existing" />
                        <span className="website-choice-body">
                          <span className="website-choice-title">Delete downloaded copies</span>
                          <span className="website-choice-copy">Previously downloaded offline packs are removed on the next online visit, and the button stays hidden.</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="github-help" id="site-settings-status">Loading website settings...</div>
                <div className="settings-status" id="settings-save-status">No save action yet.</div>
                <div className="settings-actions" style={{ marginTop: 14 }}>
                  <button className="btn btn-primary" id="settings-save-bottom-btn" type="button">Save to GitHub</button>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
      <Script src="/admin/settings.js" strategy="afterInteractive" />
    </>
  );
}

export default async function SettingsPage({ searchParams }) {
  const session = await getSession();
  if (!session?.accessToken) {
    return <LoginView error={searchParams?.error} />;
  }

  return <SettingsView user={session.user} />;
}
