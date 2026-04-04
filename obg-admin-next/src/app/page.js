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

function AdminView({ user }) {
  return (
    <>
      <link rel="stylesheet" href="/admin/editor.css" />
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <div className="admin-kicker">Protected GitHub Admin</div>
            <h1>OBG Content Dashboard</h1>
            <p>Search, edit, validate, export, and publish the question bank to GitHub using your signed-in account.</p>
          </div>
          <div className="header-actions">
            <a className="btn btn-ghost" href="/api/auth/logout">Sign out</a>
            <button className="btn btn-ghost" id="validate-all-btn" type="button">Validate</button>
            <button className="btn btn-ghost" id="export-btn" type="button">Export JSON</button>
            <button className="btn btn-primary" id="save-github-btn" type="button">Save to GitHub</button>
          </div>
        </header>

        <section className="admin-topbar">
          <div className="summary-grid" id="summary-grid"></div>
          <div className="github-panel">
            <div className="github-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <div className="panel-title" style={{ marginBottom: 8 }}>Signed in as</div>
                <div style={{ fontWeight: 800, color: "#1B3A6B" }}>{user.name || user.login}</div>
                <div className="github-help">@{user.login}</div>
              </div>
              <div>
                <div className="panel-title" style={{ marginBottom: 8 }}>GitHub-backed save</div>
                <div className="github-help">Questions load and save through secure server routes. No PAT is stored in the browser.</div>
              </div>
            </div>
          </div>
        </section>

        <main className="admin-main">
          <aside className="panel search-panel">
            <div className="panel-title">Search</div>
            <div className="search-controls">
              <label>
                Find question
                <input id="search-input" type="search" placeholder="Search ID, stem, source, note..." />
              </label>
              <label>
                Lecture
                <select id="search-lecture"></select>
              </label>
              <label>
                Type
                <select id="search-type">
                  <option value="all">All Types</option>
                  <option value="MCQ">MCQ</option>
                  <option value="FLASHCARD">Flashcard</option>
                  <option value="SAQ">SAQ</option>
                  <option value="OSCE">OSCE</option>
                </select>
              </label>
              <label>
                Status
                <select id="search-status">
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            <div className="list-meta" id="list-meta"></div>
            <div className="question-list" id="question-list"></div>
          </aside>

          <section className="panel editor-panel">
            <div className="panel-title">Editor</div>
            <div id="empty-state" className="empty-state loading-state">
              <div className="loading-spinner" aria-hidden="true"></div>
              <div className="empty-state-title">Loading question bank</div>
              <div className="empty-state-copy">Fetching your editable questions and preparing the editor.</div>
            </div>
            <div id="editor-wrap" className="editor-wrap hidden">
              <div className="editor-head">
                <div>
                  <div className="question-id" id="editor-question-id">Question</div>
                  <div className="question-sub" id="editor-question-sub"></div>
                </div>
                <div className="dirty-badge" id="dirty-badge">Saved</div>
              </div>

              <form id="editor-form" className="editor-form">
                <div className="form-grid">
                  <label>ID<input id="field-id" type="text" readOnly /></label>
                  <label>Number<input id="field-num" type="text" /></label>
                  <label>Lecture<select id="field-lecture"></select></label>
                  <label>
                    Exam
                    <select id="field-exam">
                      <option value="mid">mid</option>
                      <option value="paper1">paper1</option>
                      <option value="paper2">paper2</option>
                    </select>
                  </label>
                  <label>
                    Type
                    <select id="field-card-type">
                      <option value="MCQ">MCQ</option>
                      <option value="FLASHCARD">FLASHCARD</option>
                      <option value="SAQ">SAQ</option>
                      <option value="OSCE">OSCE</option>
                    </select>
                  </label>
                  <label>Source<input id="field-source" type="text" /></label>
                  <label>Doctor<input id="field-doctor" type="text" /></label>
                  <label className="toggle-label"><span>Active</span><input id="field-active" type="checkbox" defaultChecked /></label>
                </div>

                <label>
                  Question / stem
                  <textarea id="field-q" rows="4"></textarea>
                </label>

                <label>
                  Student note
                  <textarea id="field-note" rows="3" placeholder="Shown inline to students"></textarea>
                </label>

                <div className="editor-section">
                  <div className="section-title">Repeated in other lectures</div>
                  <div className="repeat-grid" id="repeat-lectures"></div>
                </div>

                <div className="editor-section">
                  <div className="section-title">Type-specific content</div>
                  <div id="type-editor"></div>
                </div>

                <div className="editor-section danger-zone">
                  <div className="section-title">Delete / restore</div>
                  <div className="danger-controls">
                    <label>
                      Delete mode
                      <select id="delete-mode">
                        <option value="soft">Soft delete (default)</option>
                        <option value="hard">Permanent delete</option>
                      </select>
                    </label>
                    <button className="btn btn-ghost" id="restore-btn" type="button">Restore</button>
                    <button className="btn btn-danger" id="delete-btn" type="button">Apply delete</button>
                  </div>
                </div>

                <div className="editor-actions">
                  <button className="btn btn-ghost" id="save-question-btn" type="button">Save Question</button>
                  <button className="btn btn-primary" id="save-question-github-btn" type="button">Save to GitHub</button>
                </div>
              </form>
            </div>
          </section>

          <aside className="panel preview-panel">
            <div className="panel-title">Preview & Validation</div>
            <div className="preview-card" id="preview-card"></div>
            <div className="validation-box">
              <div className="validation-title">Validation</div>
              <div id="validation-summary" className="validation-summary"></div>
              <div id="validation-list" className="validation-list"></div>
            </div>
            <div className="save-status" id="save-status">No save/export action yet.</div>
          </aside>
        </main>
      </div>
      <div
        id="admin-user-data"
        hidden
        data-user={encodeURIComponent(JSON.stringify(user))}
      />
      <Script src="/admin/editor.js" strategy="afterInteractive" />
    </>
  );
}

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const session = await getSession();
  if (!session?.login) {
    return <LoginView error={params?.error} />;
  }
  return <AdminView user={{ login: session.login, name: session.name, avatarUrl: session.avatarUrl }} />;
}
