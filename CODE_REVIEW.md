# Code review

## Assumptions
- Quick static review of the current Express-based server without executing tests or hitting external services.
- Scope limited to server-side concerns surfaced in `server.js`; front-end and deployment setups are out of scope for this pass.

## Commands to run
- _Not run_: `pnpm lint`
- _Not run_: `pnpm test`

## File tree
```
CODE_REVIEW.md
```

## Findings
1) **Overly permissive CORS with credentialed cookies** – When `CORS_ORIGIN` is unset, `cors` is configured with `origin: true` and `credentials: true`, causing the middleware to reflect any origin while allowing cookies. This effectively permits cross-site credentialed requests, exposing authenticated routes to CSRF. Lock the allowlist to trusted origins and pair with CSRF protections for state-changing endpoints.【F:server.js†L123-L138】

2) **Insecure session persistence in production** – Sessions use the default in-memory store and a fallback secret (`development-session-secret`), neither suitable for production resilience or confidentiality. MemoryStore will drop sessions on restart and can leak between workers; weak secrets make session cookies forgeable. Use an external store (e.g., Redis) and require a strong `SESSION_SECRET` at startup.【F:server.js†L40-L45】【F:server.js†L140-L151】

3) **Unaudited file uploads** – Image edit/variation routes accept up to 16 files per request without validating MIME type, extension, or dimensions. Untrusted binaries stay in memory and are forwarded to OpenAI, lacking size/type enforcement beyond the global 50MB cap. Add MIME sniffing/allow-lists and explicit limits per file to avoid resource abuse and unexpected content handling.【F:server.js†L1195-L1245】【F:server.js†L30-L38】

## Tests generated
- None (static review only).

## Next steps
- Tighten CORS to an explicit allowlist and introduce CSRF protections for authenticated routes.
- Switch sessions to a persistent store with required strong secrets and production-safe cookie settings.
- Add validation and allow-lists for uploaded assets on media endpoints.

## Suggested commit message
- `docs: document code review findings`
