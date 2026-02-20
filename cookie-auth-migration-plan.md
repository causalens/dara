# Dara Cookie Auth Migration Plan

## Goal
Migrate Dara auth from `localStorage`-backed bearer tokens to cookie-backed auth, while preserving temporary backwards compatibility by continuing to send `Authorization: Bearer ...` from the frontend for downstream packages/plugins that explicitly inspect headers.

## Non-Goals (for this PR)
- Removing bearer header emission from frontend requests.
- Removing bearer token acceptance from backend endpoints.

## Compatibility Requirement
By end of this PR:
- Cookie auth should be the primary auth path.
- Frontend should still send bearer header (legacy compatibility).
- Backend should accept both cookie and bearer token auth.

## Current Constraints and Risks
- Core auth dependency (`verify_session`) currently requires `HTTPBearer`.
- Websocket auth currently requires query `?token=...` and updates auth context via `token_update` messages.
- Session-scoped browser persistence keys currently use full JWT token values.
- Existing tests are heavily bearer-oriented and need rebalancing toward cookie behavior while keeping header regression coverage.

## Phase 0: Planning Commit
- Add this plan doc in repo root.
- Commit only this plan.

Verification gate:
- `git status` clean except plan file before commit.

---

## Phase 1: Backend dual auth primitives + cookie issuance

### Scope
1. Introduce a unified token extraction helper in auth routes:
- Prefer bearer token when present.
- Fall back to signed session cookie token.
- Keep existing bearer error semantics where applicable for explicit invalid schemes.

2. Update auth endpoints to support cookie path:
- `/api/auth/verify-session`: accept bearer or cookie.
- `/api/auth/revoke-session`: accept bearer or cookie.
- `/api/auth/refresh-token`: accept old session token from bearer or cookie; keep refresh cookie behavior.

3. Issue and clear session cookie:
- Set session cookie on successful `/api/auth/session` responses that return tokens.
- Set session cookie on `/api/auth/sso-callback` responses.
- Set rotated session cookie on `/api/auth/refresh-token`.
- Clear session cookie on revoke/error where appropriate.

4. Keep response payloads (`{ token: ... }`) unchanged for transitional compatibility.

### Notes
- Add clear constants for cookie names and attrs.
- Preserve current `dara_refresh_token` cookie behavior.

Verification gate:
- Backend lint/type checks (package standard).
- Backend auth test suite green (updated as needed for cookie path).
- Keep at least one regression test asserting bearer-only path still works.

---

## Phase 2: Frontend cookie-first auth flow with legacy bearer emission

### Scope
1. Request/auth plumbing:
- Continue sending bearer header from in-memory/local token for compatibility.
- Ensure all auth calls include cookie credentials consistently.
- Stop requiring local token presence to consider a user authenticated where cookie session exists.

2. Login flows:
- Basic/default/OIDC callback: continue storing returned token (legacy compat), but rely on cookie-backed `verify-session` for auth truth.

3. Router/auth guards:
- Remove hard dependency on `getSessionToken()` for route entry.
- Use `/api/auth/verify-session` as source of truth.

4. Websocket:
- Move to cookie-capable connection path (server accepts cookie auth).
- Keep token query / `token_update` path during transition if needed.
- Ensure refreshed auth context is correct for live WS handlers.

5. Session persistence keying:
- Replace `dara-session-${token}-...` keying with stable session identifier from backend (or compatible equivalent) so cookie-only sessions remain correct.

Verification gate:
- Frontend lint/type/tests green.
- Existing WS and routing tests updated and passing.
- Keep at least one regression test asserting bearer header is still emitted.

---

## Phase 3: Test rebalance, docs, changelog, cleanup

### Scope
1. Tests:
- Convert key auth tests to cookie-based expectations.
- Keep targeted regression coverage for bearer compatibility.
- Ensure websocket refresh/auth-context behavior remains covered.

2. Docs:
- Update auth docs to describe cookie-primary + transitional bearer behavior.

3. Changelog:
- Update `packages/dara-core/changelog.md` with `## NEXT` entry at top.

Verification gate:
- Package lint/format clean.
- Relevant backend and frontend test suites green.
- Final `git status` clean after commits.

---

## Execution Order
1. Phase 0 commit (plan file only).
2. Phase 1 implementation + green checks/tests.
3. Phase 2 implementation + green checks/tests.
4. Phase 3 tests/docs/changelog + green checks/tests.

## Rollback Strategy
- Backend remains dual-mode (cookie + bearer), reducing blast radius.
- Frontend keeps bearer emission, preserving plugin compatibility.
- If websocket cookie auth causes regressions, retain query token path until follow-up.
