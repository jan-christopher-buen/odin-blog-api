# odin-blog-api

A full-stack blog with an Express and Prisma REST API, JWT authentication, and separate React apps for readers and authors.

**Margin** pairs a typography-led reader with a compact publishing studio. Readers browse published stories and leave named comments without accounts. Authors create drafts, edit plain-text stories, publish or unpublish them, and moderate comments. Deleting a story also deletes its comments.

Built for [The Odin Project Blog API assignment](https://www.theodinproject.com/lessons/node-path-nodejs-blog-api), incorporating its [API Basics](https://www.theodinproject.com/lessons/nodejs-api-basics) and [API Security](https://www.theodinproject.com/lessons/nodejs-api-security) lessons.

## Stack and layout

JavaScript ES modules, Express 5, PostgreSQL, Prisma 7 with the PostgreSQL driver adapter, bcryptjs, jsonwebtoken, express-validator, CORS, Helmet, and rate limits. Both frontends use React, Vite, React Router, native fetch, and CSS Modules. Tests use Node's test runner/Supertest and Vitest/React Testing Library.

```text
apps/api      Express API, Prisma schema/migrations, provisioning and seed scripts
apps/blog     Public reader (white, ink, cobalt; Newsreader + DM Sans)
apps/author   Author studio (ink, lilac; compact editing and visibility controls)
```

The apps run independently in one npm-workspaces repository with one root lockfile. No account signup, uploads, HTML rendering, or rich-text editor.

## Local setup

Use Node 24 LTS, npm, and PostgreSQL on port 5432. From the repository root:

```sh
npm ci
cp apps/api/.env.example apps/api/.env
cp apps/blog/.env.example apps/blog/.env
cp apps/author/.env.example apps/author/.env
```

Inspect existing databases first. If absent, create **only** the dedicated application and test databases with your local role (`jc`):

```sh
psql -d postgres -c 'CREATE DATABASE odin_blog_api'
psql -d postgres -c 'CREATE DATABASE odin_blog_api_test'
```

Set `DATABASE_URL` and `TEST_DATABASE_URL` in `apps/api/.env` to your real local connection strings. On Ubuntu with peer authentication, append `?host=/var/run/postgresql` to the example URLs to use the local socket. Otherwise supply your local connection credentials privately. Do not change PostgreSQL authentication or other projects' databases.

Generate a private random JWT secret (for example, `openssl rand -hex 48`) and put it in `JWT_SECRET`. Keep real `.env` files private; they are ignored. Configure exact frontend origins, issuer/audience, and a finite expiry. `TRUST_PROXY_HOPS=0` is for direct local connections; change it only to match a known hosting proxy topology.

```sh
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:test:migrate
```

Prisma CLI scripts load the API `.env` using native Node environment-file support. Migrations are tracked. Use `db:migrate` for development and `db:deploy` for hosted environments. Never reset an application or hosted database. Development migration generation requires PostgreSQL permission to create Prisma's temporary shadow database.

Provision your author explicitly: privately enter `AUTHOR_USERNAME` (3–40 lowercase letters, digits, underscores or hyphens), `AUTHOR_DISPLAY_NAME`, and `AUTHOR_PASSWORD` into the API `.env`, then run:

```sh
npm run author:provision
```

Passwords must contain at least 12 characters and at most 72 UTF-8 bytes. Passwords are never trimmed or normalized. Repeating the command leaves an existing author's password/profile unchanged and refuses to promote an existing non-author. No privileged credentials are shipped. Remove the provisioning password from the environment file after use. To add optional fictional sample stories and a comment, keep `AUTHOR_USERNAME` configured and run `npm run seed`. Seeding never runs during startup or builds, and never overwrites existing sample records.

Run in three separate terminals:

```sh
npm run dev:api      # http://localhost:3000
npm run dev:blog     # http://localhost:5173
npm run dev:author   # http://localhost:5174
```

`VITE_API_URL` is the API base URL, including `/api`. All `VITE_*` values are **public build-time configuration**, never secrets. Frontend environment changes require restarting Vite or rebuilding.

## Commands

```sh
npm run format
npm run format:check
npm run lint
npm test
npm run build
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:deploy
npm run db:test:migrate
npm run author:provision
npm run seed
```

API integration tests require the migrated local `odin_blog_api_test` database. They verify the configured URL and actual database name **before deleting test data**. This database is disposable; never put valuable records there. Frontend tests mock network requests and need no running servers.

## REST API and permissions

All endpoints and errors use JSON, except successful deletions (`204`). Collection responses contain `items` and `pagination` (`page`, `limit`, `total`, `pages`). `page` defaults to 1 (maximum 99999); `limit` defaults to 10 (maximum 50). Post lists use newest publication/update first with ID tie-breakers; comments use newest creation first.

| Endpoint                                               | Permission / behavior                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `GET /api/posts`                                       | Public published summaries                                             |
| `GET /api/posts/:postId`                               | Public published story                                                 |
| `GET /api/posts/:postId/comments`                      | Public published-story comments                                        |
| `POST /api/posts/:postId/comments`                     | Public; `displayName`, `body`; rate limited                            |
| `POST /api/auth/login`                                 | `username`, `password`; returns JWT and safe user fields; rate limited |
| `GET /api/auth/me`                                     | Current authenticated author                                           |
| `GET /api/author/posts`                                | Own drafts and published stories                                       |
| `POST /api/author/posts`                               | Create own story                                                       |
| `GET /api/author/posts/:postId`                        | Read own story                                                         |
| `PATCH /api/author/posts/:postId`                      | Partially update own story                                             |
| `DELETE /api/author/posts/:postId`                     | Delete own story and its comments                                      |
| `GET /api/author/posts/:postId/comments`               | View own story's comments                                              |
| `DELETE /api/author/posts/:postId/comments/:commentId` | Moderate a comment on that exact owned story                           |

Post mutations accept `title` (1–200), optional `excerpt` (up to 400), `body` (1–50000), and optional `status` (`DRAFT` or `PUBLISHED`). Comment names are 1–80 characters; bodies are 1–2000. Mutations reject unknown/protected fields; validation failures return `422` and field details where applicable.

New stories default to draft. `PATCH` with `status` publishes or unpublishes. Publication sets `publishedAt`; unpublishing clears it, so republishing establishes a new publication date. Public details and comment routes return `404` for drafts/unpublished stories. Counts and pagination include only public records. Author operations always enforce the current database role and ownership, regardless of submitted fields or client UI.

## Authentication and safety

Protected requests use `Authorization: Bearer <token>`. JWTs use HS256 with explicit issuer/audience verification and finite expiry. The studio stores its token in localStorage, clears it on expiry/logout, and preserves a mounted unsaved editor during reauthentication. Logout clears private UI state; it **does not revoke an already issued token before expiry**. Successful XSS can read localStorage tokens. Ordinary text is rendered through React, never as raw HTML, but token storage still carries that tradeoff.

CORS permits only configured exact browser origins and handles Authorization/PATCH/DELETE preflights; it is not authorization and does not restrict curl/server clients. Login is limited to 10 attempts per IP per 15 minutes; comments to 8 per IP per minute. In-memory limits reset on restart and are per API instance. Requests have a 128 KiB JSON body limit, security headers, and generic internal-error responses. Password hashes and secrets are never returned.

## Live deployment

- [Reader](https://odin-blog-reader-pi.vercel.app)
- [Author studio](https://odin-blog-author-seven.vercel.app)
- [Public API](https://odin-blog-api-uurz.onrender.com/api/posts) — base URL: `https://odin-blog-api-uurz.onrender.com/api`

The reader and studio are separate Vercel Hobby projects. The API runs on a dedicated Render Free web service in Singapore, backed by a dedicated Neon Free PostgreSQL database. Render Free services sleep after inactivity, so the first request can take about a minute. Free provider quotas apply; no paid resources are required.

The Render service builds from the repository root with `npm ci --include=dev && npm run db:generate` and starts with `npm run start -w @margin/api`. Node 24 is configured explicitly. Database migrations and private author provisioning run separately before deployment; neither runs automatically during startup. The API uses the pooled database connection with certificate verification and a bounded connection pool. `TRUST_PROXY_HOPS=1` matches this deployment, and CORS allows only the two production frontend origins above.

Each Vercel project has its own Root Directory: `apps/blog` or `apps/author`. Both use Node 24, install with `cd ../.. && npm ci`, build with `npm run build`, and publish `dist`. Each app's tracked `vercel.json` rewrites SPA deep links to its own `index.html`. `VITE_API_URL` is the public API base URL above, configured for production before building. API secrets and author provisioning credentials are never frontend environment variables.

Production deploys follow the GitHub `main` branch. Apply any future database migrations before deploying API code that requires them. Keep secrets in private provider environment settings and never commit real environment files. The studio requires a privately provisioned author account; no public signup or demo credentials are supplied.
