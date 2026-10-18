# Accounts and demo usage limits

Built-in email + password accounts, one-click guest sessions, and daily usage caps on the routes that spend vendor money. No external service is needed.

## How it works

- **Passwords:** Node `crypto.scrypt` (N=16384, r=8, p=1, 64-byte key) with a fresh 16-byte salt per user, stored as `scrypt$salt$hash`. Login always runs one scrypt verify (against a dummy hash for unknown emails).
- **Session:** cookie `create_session` = `base64url(payload).base64url(HMAC-SHA256)`. Payload is `{sub, kind: "guest"|"account", email?, exp}`. `httpOnly`, `SameSite=Lax`, `Path=/`, 30 days, `Secure` over HTTPS/production. Signed with `SESSION_SECRET`; without it a random per-process secret is used (dev only: sessions end when the server restarts). **Set `SESSION_SECRET` in production.**
- **Guests** are stateless (a signed token with a random id, nothing stored). Calling `/auth/guest` again keeps the same id so a reload does not reset the quota.
- **User store:** Mongo collection `users` (unique indexes on `email` and `id`) when `MONGODB_URI` is set; otherwise `apps/server/.data/users.json`, rewritten atomically (temp file + rename, writes serialized). `.data` is gitignored.

## API

| Route | Notes |
|---|---|
| `POST /api/auth/signup` `{email,password,name?}` | password 8 to 200 chars; 409 on duplicate email |
| `POST /api/auth/login` `{email,password}` | 401 `Incorrect email or password.` |
| `POST /api/auth/guest` | one-click guest session |
| `POST /api/auth/logout` | clears the cookie |
| `GET /api/auth/me` | `{user|null, authRequired, showSignIn}` |
| `GET /api/usage` | `{kind, admin, enforced, resetAt, buckets:{build,lift,chat:{limit,used,remaining}}}` |

Auth routes are limited to 10 requests/min per IP.

## Quotas

Buckets and the routes that draw from them (POST only):

| Bucket | Routes | Guest / day | Account / day |
|---|---|---|---|
| build | `/generate`, `/generate-sketch`, `/canvas-ops` | 10 | 30 |
| lift | `/lift`, `/extract`, `/locate` (only `mode: "commit"`) | 20 | 60 |
| chat | `/ask`, `/edit-node` | 40 | 120 |

- A per-IP daily cap (5x the guest cap) applies on top, so fresh guest sessions from one network cannot farm the demo.
- Days are UTC; `resetAt` is the next UTC midnight. Counters live in memory, or in Mongo collection `usage` (atomic `$inc`, TTL index) when `MONGODB_URI` is set, which makes them correct across serverless instances.
- Over the cap: `429 {"error":"Demo limit reached","bucket":"build","resetAt":"..."}`. The web shows a toast ("Daily demo limit reached for builds. It resets at ...") and the usage meter in the avatar menu and Settings.
- Quotas are skipped when `MOCK_AI=1` (mock calls cost nothing) unless `DEMO_QUOTAS=1`.

## Environment

| Variable | Effect |
|---|---|
| `SESSION_SECRET` | HMAC key for session cookies. Required in production. |
| `AUTH_REQUIRED=1` | Cost routes return `401 {code:"auth_required"}` without a session, and the web always shows the sign-in screen. Unset (default): anonymous calls keep working and are not quota-limited. |
| `DEMO_ADMIN_EMAILS` | Comma-separated emails that bypass every quota. |
| `DEMO_QUOTAS=1` | Enforce quotas even on mock servers and for anonymous callers. |
| `MONGODB_URI` | Store users and usage in Mongo instead of local files / memory. |

Web behaviour: the sign-in screen appears before onboarding whenever the server says `showSignIn` (accounts required, or real AI is on). On a mock server it is skipped, so the mock test gates and e2e run unchanged.

## Swapping in Supabase

The seam is small: the server only needs to turn a request into `req.session = {sub, kind, email}`.

1. Create a Supabase project; set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (and `SUPABASE_JWT_SECRET`, or use the project's JWKS endpoint).
2. Web: replace the `fetch("/api/auth/*")` calls in `apps/web/src/auth/authStore.ts` with `supabase.auth.signUp / signInWithPassword / signInAnonymously` (anonymous sign-in replaces "Continue as guest"). Send the access token as `Authorization: Bearer <jwt>` (add it in `lib/api.ts` `postJson`).
3. Server: in `attachSession` (`apps/server/src/auth/index.ts`), when `Authorization: Bearer` is present, verify the JWT (HS256 with `SUPABASE_JWT_SECRET`, or RS256/ES256 via JWKS) and set `req.session = {sub: claims.sub, kind: claims.is_anonymous ? "guest" : "account", email: claims.email, exp: claims.exp*1000}`. The quota gate, usage route and admin bypass need no change.
4. Delete the signup/login/guest routes and `UserStore` (or keep the cookie path as a fallback). `GET /api/auth/me` can keep returning the verified claims.
5. Row-level security is not needed for quotas: counters stay in our `usage` store keyed by `sub`.

## Tests

`apps/server/src/auth/auth.test.ts` (crypto, signup/login, cookie flags, forged cookie, guest/account/admin limits, daily reset, `AUTH_REQUIRED`, `/locate` commit-only) and `apps/web/src/auth/auth.test.ts` (parsing, gate logic, limit toast, store).

## Known limits

- The Mongo user store and Mongo usage counter are written to the driver's documented semantics but were not exercised against a live database; the file/memory paths are what the tests cover.
- No email verification or password reset; sessions cannot be revoked server-side before the 30 days end other than by rotating `SESSION_SECRET`.
- A request that fails after passing the gate still counts toward the quota.
