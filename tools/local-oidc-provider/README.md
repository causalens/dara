# Local OIDC Provider

Controllable local OpenID Connect provider for auth QA. It uses
`oidc-provider` for the protocol implementation and adds QA-only endpoints for
switching users, claims, expiry, refresh-token behavior, and userinfo behavior.

The defaults are wired for `packages/demo-app`, but the provider itself is not
Dara-specific.

## Install

```sh
cd tools/local-oidc-provider
npm install --no-package-lock
```

## Run

```sh
cd tools/local-oidc-provider
npm start
```

Default provider config:

| Setting | Default |
| --- | --- |
| Issuer | `http://localhost:9001` |
| Client ID | `local-oidc-client` |
| Redirect URI | `http://localhost:8000/sso-callback` |
| Post-logout redirect URI | `http://localhost:8000/logout` |
| Token endpoint auth | public client / PKCE |
| ID token signing alg | `RS256` |
| Allowed-group test value | `qa-users` |

Override with environment variables:

```sh
QA_OIDC_ISSUER=http://localhost:9100 \
QA_OIDC_CLIENT_ID=my-client \
QA_OIDC_REDIRECT_URI=http://localhost:3000/callback \
QA_OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:3000/logout \
QA_OIDC_ALLOWED_GROUP=my-allowed-group \
npm start
```

Use `QA_OIDC_REDIRECT_URIS` and `QA_OIDC_POST_LOGOUT_REDIRECT_URIS` for
comma-separated URI lists.

## Dara Demo App

Source one of the demo-app helper scripts in your current shell, then start the
app from `packages/demo-app`.

fish:

```fish
cd packages/demo-app
source scripts/use-local-oidc.fish
poetry run dara start --reload
```

bash/zsh:

```sh
cd packages/demo-app
source scripts/use-local-oidc.sh
poetry run dara start --reload
```

For userinfo-specific cases:

```fish
source scripts/use-local-oidc.fish --userinfo
```

```sh
source scripts/use-local-oidc.sh --userinfo
```

## Profiles

Switch profiles while the provider is running:

```sh
cd tools/local-oidc-provider
npm run profile:happy
npm run profile:huge-groups
npm run profile:missing-group
npm run profile:no-groups-claim
npm run profile:groups-string
npm run profile:single-group-string
npm run profile:unverified-email
npm run profile:short-expiry
npm run profile:refresh-loses-group
npm run profile:no-refresh-token
npm run profile:userinfo-groups
npm run profile:userinfo-denied
npm run profile:userinfo-sub-mismatch
npm run profile:refresh-reuses-token
npm run profile:missing-id-token
```

Use a fresh browser session or log out between login-focused profiles.

## QA Matrix

| Profile | Covers | Expected relying-party behavior |
| --- | --- | --- |
| `happy` | Normal auth-code + PKCE login, ID token groups, refresh token issuance | Login succeeds and refresh is possible. |
| `huge-groups` | Very large ID token/userinfo group claims | RP handles or rejects large claims deliberately; no accidental browser-cookie/header overflow. |
| `missing-group` | Authenticated user lacks required app group | RP denies access with a clear authz failure. |
| `no-groups-claim` | Provider omits the groups claim | RP treats missing groups distinctly from an empty/denied group set where relevant. |
| `groups-string` | Provider returns groups as a comma-delimited string instead of an array | RP accepts the configured group from the split values while preserving the whole string for exact matching. |
| `single-group-string` | Provider returns one group as a string instead of an array | RP accepts the configured group as a single value. |
| `unverified-email` | Provider sets `email_verified=false` | RP behavior matches its email verification policy. |
| `short-expiry` | Short-lived ID token | RP refresh path is exercised shortly after login. |
| `refresh-loses-group` | Group membership changes between login and refresh | RP re-checks authorization on refresh and denies if access is lost. |
| `no-refresh-token` | Provider does not issue refresh token | RP falls back to relogin/terminal auth failure after expiry. |
| `userinfo-groups` | Userinfo supplies the allowed group while ID token does not | RP succeeds only when configured to trust userinfo. |
| `userinfo-denied` | Userinfo overrides initially allowed ID token groups | RP denies when configured to trust userinfo. |
| `userinfo-sub-mismatch` | Userinfo subject differs from ID token subject | RP rejects userinfo as invalid. |
| `refresh-reuses-token` | Refresh succeeds without token rotation | RP handles stable refresh tokens. |
| `missing-id-token` | Token endpoint omits `id_token` | RP rejects callback/refresh as invalid token response. |

## QA Endpoints

```sh
curl http://localhost:9001/__qa/health
curl http://localhost:9001/__qa/profile
curl http://localhost:9001/__qa/profiles
curl -X POST http://localhost:9001/__qa/profile/huge-groups
curl -X PATCH http://localhost:9001/__qa/profile \
  -H 'Content-Type: application/json' \
  --data '{"hugeGroupsCount":1200,"expSeconds":5}'
```

The discovery document is available at:

```text
http://localhost:9001/.well-known/openid-configuration
```

## Smoke Test

With the provider running:

```sh
cd tools/local-oidc-provider
npm run smoke
```

The smoke test exercises authorization code, nonce propagation, large claims,
claim shape variants, refresh behavior, missing refresh tokens, and missing ID
tokens.
