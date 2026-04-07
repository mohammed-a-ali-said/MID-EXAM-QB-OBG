import Script from "next/script";
function SettingsView() {
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
            <div className="github-help" id="settings-user-name" style={{ fontWeight: 800, color: "#1B3A6B", fontSize: ".95rem" }}>Loading...</div>
            <div className="github-help" id="settings-user-login"></div>
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

export default function SettingsPage() {
  return <SettingsView />;
}
