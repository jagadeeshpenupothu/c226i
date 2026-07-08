# PrintPilot Cloudflare Local Backend

This workspace is a local-only proof for the future Cloudflare backend path:

Firebase Auth -> Worker -> D1 -> private R2

It does not deploy resources, verify Firebase JWTs, upload PDFs, reserve quota, or integrate with the PrintPilot app.

## Commands

```bash
npm install
npm run db:migrate:local
npm run dev
npm test
npm run test:local
```

Local smoke checks:

- `GET /health`
- `GET /probe/auth` with `Authorization: Bearer <Firebase ID token>`
- `POST /probe/d1`
- `POST /probe/r2`

Do not run `wrangler deploy` for this workspace.

`FIREBASE_PROJECT_ID` is the Firebase project audience/issuer value used for ID-token verification. Public keys are fetched from Google Secure Token JWKS and cached according to response `Cache-Control`.

Note: Wrangler 4.108.0 requires macOS 13.5+ for the local Workers runtime. On older macOS hosts, `npm run test:local` fails before the Worker starts; run the same command on macOS 13.5+ or in a supported Linux DevContainer.
