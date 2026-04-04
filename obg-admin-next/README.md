# OBG Admin Next

Protected admin dashboard for editing the public OBG question bank with GitHub OAuth.

## Features

- GitHub OAuth login
- allowlist restriction by GitHub username
- protected questions API
- export JSON locally
- save `data/questions.json` directly back to GitHub
- student-safe fields:
  - `active`
  - `alsoInLectures`
  - `note`

## Environment

Copy `.env.example` to `.env.local` and fill in the values.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## GitHub OAuth app

Set the callback URL to:

```text
http://localhost:3000/api/auth/callback
```

For production, add your deployed URL version too, for example:

```text
https://your-admin-domain.vercel.app/api/auth/callback
```
