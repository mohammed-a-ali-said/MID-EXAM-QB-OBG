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
            <button className="btn btn-ghost" id="undo-btn" type="button">Undo</button>
            <button className="btn btn-ghost" id="redo-btn" type="button">Redo</button>
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
            <div className="editor-section create-panel">
              <div className="panel-title">Create & Generate</div>
              <div className="search-controls">
                <label>
                  New question
                  <div className="inline-create inline-create-wide">
                    <select id="new-question-type" defaultValue="MCQ">
                      <option value="MCQ">MCQ</option>
                      <option value="FLASHCARD">Flashcard</option>
                      <option value="SAQ">SAQ</option>
                      <option value="OSCE">OSCE</option>
                    </select>
                    <button className="mini-btn" id="new-question-btn" type="button">Create</button>
                    <button className="mini-btn" id="duplicate-question-btn" type="button">Duplicate Current</button>
                  </div>
                </label>
                <label>
                  New lecture bucket
                  <div className="inline-create">
                    <input id="new-lecture-input" type="text" placeholder="Lecture name" />
                    <button className="mini-btn" id="add-lecture-btn" type="button">Add</button>
                  </div>
                </label>
                <div id="lecture-buckets" className="bucket-list"></div>
                <label>
                  New exam section
                  <div className="inline-create">
                    <input id="new-exam-input" type="text" placeholder="e.g. final, paper3" />
                    <button className="mini-btn" id="add-exam-btn" type="button">Add</button>
                  </div>
                </label>
                <div id="exam-buckets" className="bucket-list"></div>
                <div className="editor-section template-builder">
                  <div className="section-title">Bulk Template Builder</div>
                  <p className="section-copy">
                    Export one professional CSV that can hold mixed question types, multiple lectures, custom exam sections,
                    and brand-new bucket names. Leave IDs blank to auto-generate them on import, or prefill IDs now for delegated content entry.
                  </p>
                  <div className="form-grid compact-grid">
                    <label>
                      Template style
                      <select id="template-kind">
                        <option value="MIXED">Mixed question workbook</option>
                        <option value="MCQ">MCQ starter rows</option>
                        <option value="FLASHCARD">Flashcard starter rows</option>
                        <option value="SAQ">SAQ starter rows</option>
                        <option value="OSCE">OSCE starter rows</option>
                      </select>
                    </label>
                    <label>
                      Starter rows
                      <input id="template-rows" type="number" min="0" step="1" value="12" />
                    </label>
                    <label>
                      Default lecture
                      <input id="template-lecture" type="text" list="template-lecture-options" placeholder="Existing or brand-new lecture" />
                    </label>
                    <label>
                      Default exam section
                      <input id="template-exam" type="text" list="template-exam-options" placeholder="mid, final, paper3, ..." />
                    </label>
                    <label>
                      Default source
                      <input id="template-source" type="text" placeholder="Question set source" />
                    </label>
                    <label>
                      Default doctor
                      <input id="template-doctor" type="text" placeholder="Optional" />
                    </label>
                    <label>
                      Number prefix
                      <input id="template-num-prefix" type="text" value="Q" placeholder="e.g. Q" />
                    </label>
                    <label>
                      Stem placeholder
                      <input id="template-prefix" type="text" placeholder="Write the question here" />
                    </label>
                  </div>
                  <datalist id="template-lecture-options"></datalist>
                  <datalist id="template-exam-options"></datalist>
                  <div className="form-grid compact-grid">
                    <label className="toggle-label bulk-toggle">
                      <span>Pre-generate question IDs</span>
                      <input id="template-generate-ids" type="checkbox" defaultChecked />
                    </label>
                    <label className="toggle-label bulk-toggle">
                      <span>Apply defaults to starter rows</span>
                      <input id="template-fill-defaults" type="checkbox" defaultChecked />
                    </label>
                  </div>
                  <label>
                    Default note
                    <textarea id="template-note" rows="2" placeholder="Optional note for all generated questions"></textarea>
                  </label>
                  <div className="template-help">
                    Columns include <code>id</code>, <code>lecture</code>, <code>exam</code>, <code>cardType</code>, <code>q</code>,
                    <code>a</code>, <code>choiceA</code> to <code>choiceF</code>, <code>ans</code>, <code>image</code>, <code>imageAlt</code>,
                    <code>imagePlaceholder</code>, <code>imagePlaceholderText</code>, and <code>osce_json</code>.
                    Each row can use a different lecture, exam section, and question type. New lecture or exam names are created automatically during import.
                    Set starter rows to <strong>0</strong> to export headers only and let others duplicate rows freely in Excel or Sheets.
                  </div>
                  <div className="inline-actions">
                    <button className="btn btn-primary" id="generate-template-btn" type="button">Export CSV Template</button>
                    <button className="btn btn-ghost" id="import-template-btn" type="button">Import Completed CSV</button>
                  </div>
                  <input id="template-file-input" type="file" accept=".csv,text/csv" className="hidden" />
                </div>
              </div>
            </div>
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
                    <select id="field-exam"></select>
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
                  <div className="section-title">Question Media</div>
                  <div className="section-copy">
                    Add either a public HTTPS image URL or a base64 <code>data:image/...</code> string. Placeholder text stays available for questions where the original image is still pending.
                  </div>
                  <label>
                    Image source
                    <textarea id="field-image" rows="3" placeholder="https://... or data:image/png;base64,..."></textarea>
                  </label>
                  <div className="form-grid">
                    <label>
                      Alt text / caption
                      <input id="field-image-alt" type="text" placeholder="Describe the image for students" />
                    </label>
                    <label className="toggle-label media-toggle">
                      <span>Use placeholder note</span>
                      <input id="field-image-placeholder" type="checkbox" />
                    </label>
                  </div>
                  <label>
                    Placeholder text
                    <textarea id="field-image-placeholder-text" rows="2" placeholder="Shown when no real image is available yet"></textarea>
                  </label>
                </div>

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
            <div className="validation-box">
              <div className="validation-title">Activity Log</div>
              <div className="save-status" id="save-status">No save/export action yet.</div>
            </div>
            <div className="validation-box">
              <div className="validation-title">History & Undo</div>
              <div id="history-meta" className="history-meta">No draft changes yet.</div>
              <div id="history-list" className="history-list"></div>
            </div>
          </aside>
        </main>
      </div>
      <div id="import-preview-modal" className="import-preview-modal hidden" aria-hidden="true">
        <div className="import-preview-backdrop" data-import-dismiss="true"></div>
        <section className="import-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
          <header className="import-preview-header">
            <div>
              <div className="admin-kicker">Import Review</div>
              <h2 id="import-preview-title">Preview imported CSV before merge</h2>
              <p>Review the staged rows, fix quick issues, then apply the import when everything looks right.</p>
            </div>
            <button className="btn btn-ghost" id="import-preview-close-btn" type="button">Close</button>
          </header>
          <div className="import-preview-toolbar">
            <div className="import-preview-tabs" id="import-preview-tabs">
              <button className="mini-btn is-active" id="import-preview-summary-tab" data-import-tab="summary" type="button">Summary</button>
              <button className="mini-btn" id="import-preview-rows-tab" data-import-tab="rows" type="button">Rows</button>
            </div>
            <div className="import-preview-actions">
              <button className="btn btn-ghost" id="import-preview-cancel-btn" type="button">Cancel</button>
              <button className="btn btn-primary" id="import-preview-apply-btn" type="button">Apply Import</button>
            </div>
          </div>
          <div className="import-preview-body">
            <section id="import-preview-summary-panel" className="import-preview-panel">
              <div className="import-preview-grid" id="import-preview-summary-grid"></div>
              <div className="import-preview-issues">
                <div className="panel-title">Import Issues</div>
                <div id="import-preview-issues-list" className="validation-list"></div>
              </div>
            </section>
            <section id="import-preview-rows-panel" className="import-preview-panel hidden">
              <div className="section-copy" style={{ marginBottom: 12 }}>
                Quick-edit the most important row fields here before import. If a row still has blocking issues, the import button stays disabled.
              </div>
              <div id="import-preview-rows" className="import-preview-rows"></div>
            </section>
          </div>
        </section>
      </div>
      <div id="confirm-modal" className="confirm-modal hidden" aria-hidden="true">
        <div className="confirm-backdrop" data-confirm-dismiss="true"></div>
        <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="confirm-kicker" id="confirm-kicker">Confirm action</div>
          <h2 id="confirm-title">Apply this change?</h2>
          <p id="confirm-message">Review this action before continuing.</p>
          <div className="confirm-actions">
            <button className="btn btn-ghost" id="confirm-cancel-btn" type="button">Cancel</button>
            <button className="btn btn-primary" id="confirm-accept-btn" type="button">Continue</button>
          </div>
        </section>
      </div>
      <div id="toast-viewport" className="toast-viewport" aria-live="polite" aria-atomic="true"></div>
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
