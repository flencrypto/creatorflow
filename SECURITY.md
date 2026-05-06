# Security Notes

## OAuth state protection

CreatorFlow now enables `state` protection for Google and Facebook OAuth flows. When a user starts an OAuth login, the server issues a high-entropy `state` token that is stored in their session and appended to the provider redirect URL. Callback handlers validate the `state` value before attempting to exchange authorization codes. Requests without a matching `state` are rejected and redirected to the login error page, blocking CSRF attempts that try to replay or forge OAuth responses.

### Integration guidance

- Ensure clients preserve the session cookie (`connect.sid`) between the initial `/auth/google` or `/auth/facebook` redirect and the subsequent callback. Losing the cookie will cause the callback to fail because the `state` token cannot be validated.
- When deploying behind load balancers or multiple application nodes, configure a shared session store (e.g., Redis, Memcached, SQL) so the `state` token is available during the callback.
- If you customise OAuth flows, always propagate the generated `state` parameter and do not override it with static values.

Automated tests cover both providers to guarantee that callbacks reject missing or tampered `state` values, preventing regressions.
