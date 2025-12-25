# Code review

## Assumptions
- Quick static review of the current Express-based server without executing tests or hitting external services.
- Review focuses on server-side paths and shared API client utilities; front-end and deployment setups are out of scope.

## How to run
- _Not run_: `pnpm lint`
- _Not run_: `pnpm test`

## Scope
- `server.js`
- `lib/openai.js`
- `lib/perplexity.js`

## File tree
```
CODE_REVIEW.md
```

## Findings
1) **Missing baseline security headers** – The server sets up CORS/session middleware but never applies baseline security headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.). This leaves browsers without defense-in-depth against clickjacking and content injection. Add a hardened `helmet` policy (or equivalent headers) with an explicit CSP and tighten per-route overrides if needed.【F:server.js†L247-L279】

2) **No timeouts/retries on external AI requests** – OpenAI and Perplexity requests are sent via `fetch` without timeouts, retries, or jitter/backoff. A stalled upstream connection can tie up server resources indefinitely, and transient errors will surface directly to users. Introduce AbortController timeouts and a bounded retry strategy for these outbound calls.【F:lib/openai.js†L270-L309】【F:lib/perplexity.js†L44-L83】

3) **`generateContentStream` will throw at runtime** – The streaming helper calls `createClient(apiKey)` without importing or defining `createClient`. If this export is used, it will crash with a `ReferenceError`. Import the OpenAI client or remove/guard the dead code to prevent production breakage.【F:lib/openai.js†L427-L452】

## Tests generated
- None (static review only).

## Next steps
- Add a security headers middleware (Helmet) with CSP and clickjacking protections.
- Wrap external AI HTTP calls with timeouts/retries and surface clear timeout errors.
- Fix the missing OpenAI client import or remove the unused streaming helper.

## Suggested commit message
- `docs: update code review findings`
