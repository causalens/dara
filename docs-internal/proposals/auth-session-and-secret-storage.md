# Auth Session And JWT Secret Storage Proposal

Status: Draft

## Summary

Dara recently moved browser auth sessions to opaque cookie handles backed by server-side session storage. That fixes large-cookie and token-exposure issues, but it makes local development with `dara start --reload` frustrating: every Python reload loses the in-process auth session map, so users and agents must log in again.

This proposal adds a narrow backend model for auth session storage and cleans up JWT secret persistence semantics:

- keep the current in-memory auth session store as the default runtime behavior
- select a file auth session backend by default for local `--reload` development, unless explicitly overridden
- treat file auth sessions as local or single-host storage, not as the future distributed production answer
- keep JWT secret autogeneration for compatibility, but make production risk visible through a loud warning when the secret is not explicitly configured
- leave room for auth session storage to plug into real shared backends outside this proposal, such as Redis, Valkey, or an application database

The immediate goal is better local development ergonomics. Reload loops for both users and coding agents should not require repeated login flows. The backend boundary also avoids baking the current in-memory auth store into the framework as the only possible storage model.

This is intentionally similar to Django's session backend model: Django has multiple session engines, including a [file-based session engine](https://docs.djangoproject.com/en/stable/topics/http/sessions/#using-file-based-sessions) that stores one session per file under a configurable directory. Dara should borrow the backend shape. Django's built-in authentication stores the authenticated user's id and backend path in the session, not an upstream OIDC/JWT access token or refresh token by default, but Django sessions are general-purpose application storage and OAuth/OIDC integrations may store sensitive auth state or tokens there. Dara's file backend should likewise assume session files are sensitive because Dara itself stores raw auth and refresh token material server-side.

## Motivation

### Local Development

`--reload` currently restarts the Python process whenever source files change. With server-side auth sessions, that restart clears the session map. The browser still has a `dara_session_token` cookie, but the new process cannot resolve it, so the user is forced back through login.

This is especially costly for:

- OIDC applications with multi-step login redirects
- local debugging loops where the app restarts frequently
- agent-driven development, where repeated auth prompts slow down reproduction and verification

Frontend systems usually solve this class of interruption through HMR. Dara's Python backend cannot preserve in-process memory across reloads, so local auth session storage needs a small durable backend.

### Production

Production should not have to depend on process-local auth session state forever. The current in-memory store is still a valid default for compatibility, but it is process-local and not multi-worker safe. Production use is acceptable when logout-on-restart and worker-local session state are explicitly acceptable.

The file backend may be useful for local development, demos, POCs, or simple single-host apps where restart continuity is valuable and the operator accepts local-file semantics and local disk compromise risk. Proper production deployments should either keep the in-memory backend if session loss on restart is acceptable, or use a database/shared-cache auth session backend implemented outside this proposal.

### JWT Secret Stability

Dara currently autogenerates `JWT_SECRET` into a local `.env` file when one is missing. This gives local reloads a stable signing key, which is useful. The downside is that the same fallback can mask production misconfiguration: if a deployment starts without a persistent explicit secret, sessions are invalidated when the generated secret changes.

Changing that behavior to a hard startup failure would break existing apps. A warning-first migration is safer.

## Non-Goals

- Do not move raw auth tokens back into browser storage.
- Do not make file auth sessions a distributed-safe production backend.
- Do not require users to pass an extra CLI flag for the common `--reload` development loop.
- Do not immediately fail production startup when `JWT_SECRET` is missing, because existing deployments may rely on the current fallback.
- Do not implement the full distributed runtime backend system as part of this narrow change.

## Proposed Auth Session Backend Model

Introduce an internal auth session backend boundary close to the existing store operations, but split creation from refresh-time replacement:

```python
class AuthSessionBackend(Protocol):
    async def create(self, auth_token: str, token_data: TokenData, refresh_token: str | None = None) -> str: ...
    async def update(
        self, session_token: str, auth_token: str, token_data: TokenData, refresh_token: str | None = None
    ) -> bool: ...
    async def get(self, session_token: str) -> StoredAuthSession | None: ...
    async def remove(self, session_token: str) -> StoredAuthSession | None: ...
    async def clear(self): ...
```

Implementations in this proposal:

- `InMemoryAuthSessionBackend`: current behavior, process-local, default outside reload
- `FileAuthSessionBackend`: local durable backend, selected by default for `--reload`

Future implementation candidates outside this proposal:

- `RedisAuthSessionBackend` / `ValkeyAuthSessionBackend`
- database-backed implementation for applications that already have a relational store
- custom user-provided backends

The existing auth routes should continue to depend on the auth session store abstraction rather than on a specific backend.

## Default Selection

Backend selection should use a backend object or factory on the configuration. The default value should be a small auto factory:

```python
config.auth_session_backend = auto_auth_session_backend
```

`auto_auth_session_backend` should be called once during startup and return a concrete backend:

1. If local `--reload` development is enabled, resolve to the file backend.
2. Otherwise resolve to the in-memory backend.

Explicit Python configuration still wins by replacing the default factory:

Example behavior:

```text
dara start
  -> memory auth session backend

dara start --reload
  -> file auth session backend

config.auth_session_backend = InMemoryAuthSessionBackend()
dara start --reload
  -> memory auth session backend

config.auth_session_backend = FileAuthSessionBackend()
dara start
  -> file auth session backend
```

This makes the common development path frictionless while keeping the implicit behavior controllable.

The implicit `--reload` default should not apply in production/docker modes. In those modes, `auto_auth_session_backend` should resolve to memory, and file storage should require explicit Python configuration. Explicit file storage should log that raw auth session material is being persisted to disk.

Startup should log the selected backend. For reload-driven file storage, log something explicit:

```text
Using file auth session backend for reload development; auth sessions may persist across local restarts.
```

## File Backend Storage Shape

The file backend should store one session per file, following the same broad shape as Django's file session backend.

Default root:

```text
tempfile.gettempdir() / "dara-sessions" / <app-key>
```

Example:

```text
/tmp/dara-sessions/3f1c.../
  5f2e...c91.json
  b190...8aa.json
```

`<app-key>` should be a stable hash derived from the project current working directory:

```text
sha256(project_cwd)
```

Dara should create the app-key directory with owner-only permissions where the platform supports it. A configured root path must be an existing writable directory. The default temp directory root should still be checked at startup; if Dara cannot create and write to the app-key directory, it should fail with an actionable error rather than assuming `/tmp` or the platform temp directory is usable. If secure permissions cannot be established for a file backend on a platform that supports them, startup should fail loudly rather than silently writing token material somewhere unsafe.

The session filename should be derived from the opaque session token, but should not expose the token itself in directory listings:

```python
filename = sha256(session_token.encode()).hexdigest() + ".json"
```

Each file stores the server-side auth session entry:

```json
{
  "auth_token": "...",
  "refresh_token": "...",
  "token_data": { "...": "..." },
  "token_expires_at": 123,
  "retention_expires_at": 456
}
```

The backend should preserve the current retention semantics:

- active sessions are returned as active
- expired auth tokens may remain available while refresh retention is valid
- entries beyond retention are removed or ignored
- sessions are removed on logout/revoke

Implementation principles:

- store one full session snapshot per file
- avoid a central index file
- avoid long-held locks
- treat missing, expired, malformed, or unreadable files as absent sessions
- use last-writer-wins semantics for concurrent writes
- make `create` the only operation that creates a new session file
- make `update` update an existing session file and return `False` for missing sessions so refresh cannot recreate a logged-out or revoked session
- make no multi-host consistency guarantees

Writes should be as atomic as the underlying filesystem permits:

1. write to a temporary file in the target directory
2. flush and fsync where practical
3. publish with `os.replace`

Readers should only observe the previous complete file or the next complete file.

This is the right shape for local filesystems. A shared filesystem such as NFS may be acceptable for demos or POCs if the operator accepts its consistency and locking caveats, but Dara should not present that as the robust production scaling story. Applications that need stronger guarantees should use a database or shared cache backend implemented outside this proposal.

The file backend should only construct paths from parsed session-file names matching the expected hash format, such as `<64 lowercase hex>.json`; it should never join raw session tokens or caller-provided filenames. Malformed, unreadable, or oversized files should be treated as absent for authentication decisions, but should produce sanitized warnings or metrics that do not include token contents or full payloads.

Access-time cleanup only removes sessions that are read. The backend should expose a `clear_expired()`-style maintenance operation so stale files can be reaped through a CLI or startup maintenance path without requiring user traffic.

## JWT Secret Storage

JWT signing key stability is a separate but related problem. A durable file auth session backend only helps if the raw auth token behind the opaque handle can still be verified after restart.

The current local `.env` generation exists for a good reason: without a stable `JWT_SECRET`, local reloads invalidate sessions. However, implicit `.env` writes are not ideal:

- framework startup mutates the application directory
- generated secrets may be accidentally committed
- production deployments can appear to work while relying on an unintended generated secret

The proposed behavior is:

1. If `JWT_SECRET` is configured through settings, use it. The auth layer does not need to care whether the value came from environment variables, `.env`, or another settings source.
2. Keep the existing settings-loading behavior for compatibility.
3. If no secret is configured in local development, generate or reuse a Dara-owned local development secret.
4. If no secret is configured in production/docker, keep current fallback behavior for compatibility but emit a loud warning.

Local development secret storage should be outside the repository, for example:

```text
<user-cache-dir>/dara/dev-secrets/<app-key>/jwt-secret
```

Use `platformdirs` to resolve the appropriate user-private state, config, or cache location for the current OS. On Unix-like systems, this should follow the usual XDG-style locations such as `$XDG_STATE_HOME`, `$XDG_CONFIG_HOME`, `$XDG_CACHE_HOME`, or the corresponding default under the user's home directory.

This avoids dirty worktrees and accidental commits while keeping reload behavior stable. Unlike session files, the generated development secret should not live under `/tmp`, because temp cleanup would bring back session invalidation after local restarts. If Dara chooses a cache directory, the docs should explicitly say that clearing that cache invalidates local sessions.

Production warning:

```text
JWT_SECRET is not explicitly configured. Dara generated a fallback secret.
This is not suitable for production because sessions may be invalidated on restart
and workers may disagree on token verification. Set JWT_SECRET via environment
or a mounted secret file.
```

This should be a warning first, not a hard failure. Django's precedent is stricter: a missing `SECRET_KEY` is fatal. Dara intentionally keeps a compatibility fallback for now because existing deployments may rely on the current behavior, but production/deploy mode should treat generated fallback secrets as a security warning requiring explicit operator attention.

Secret rotation is outside this proposal. If Dara adds `JWT_SECRET_FALLBACKS`, fallbacks should verify old tokens only, never sign new ones, and docs should require removing old keys after the intended rotation window.

## Security Notes

The file auth session backend stores raw auth tokens and may store refresh tokens. That is more sensitive than ordinary UI state.

Required guardrails:

- keep the browser cookie opaque
- never write raw auth or refresh tokens into browser storage
- create session directories with owner-only permissions and session files with owner-only read/write permissions where the platform supports them
- avoid following symlinks when opening session files
- store files outside the repository by default
- log clearly when file storage is enabled
- remove expired sessions when they are accessed
- expose a maintenance path to clear expired session files
- remove session files on revoke/logout
- document that file storage is local/single-host storage and that shared production deployments should prefer a database or shared cache backend when available

## Execution Plan

Implement this as small vertical slices that each preserve today's behavior until the new path is explicitly selected.

### Slice 1: Make Auth Session Storage Pluggable

Refactor the existing in-memory store into the first concrete backend without changing behavior:

- keep the current module-level `auth_session_store` facade used by auth routes
- introduce an internal `AuthSessionBackend` protocol matching the current async operations
- move the existing dictionary and lock implementation behind `InMemoryAuthSessionBackend`
- preserve current memory-backed retention, lookup, removal, and clearing behavior
- split the current internal `set` behavior into explicit `create` and `update` semantics before adding additional backends
- update refresh callers to use `update` and treat `False` as an invalid, missing, or revoked session
- add focused tests proving the in-memory backend still handles retention, refresh, removal, and expired-session behavior as it does today

This keeps the route layer stable while giving startup code a single place to install a different backend.

### Slice 2: Add The File Auth Session Backend

Add `FileAuthSessionBackend` behind the same interface:

- store one complete session snapshot per file
- derive the app key from `sha256(project_cwd)`
- use `tempfile.gettempdir() / "dara-sessions" / <app-key>` as the default session root
- derive filenames from `sha256(session_token.encode()).hexdigest() + ".json"`
- write via temporary file, flush/fsync where practical, then `os.replace`
- read only parsed `<64 lowercase hex>.json` session files and treat missing, expired, malformed, oversized, or unreadable files as absent
- make `create` create new session files and make `update` update only an existing session file
- implement `clear()` by removing all valid session files for the app key
- validate the resolved root at startup, require explicit roots to be existing writable directories, create default app directories and files with owner-only permissions where supported, avoid following symlinks, and emit sanitized warnings or metrics for malformed, unreadable, or oversized files
- remove files on logout/revoke and expose `clear_expired()` for maintenance

Test this backend directly with `tmp_path`:

- created sessions survive a new backend instance pointed at the same directory
- file names do not contain raw session tokens
- expired sessions are ignored or removed according to existing retention behavior
- malformed, oversized, unreadable, and missing files do not authenticate a request
- concurrent-ish writes leave either the old complete file or the new complete file, never a partial JSON file
- `update` does not recreate a deleted session
- `clear()` removes all valid session files for that backend scope
- root validation, owner-only permissions where supported, symlink handling, and sanitized warning behavior are covered

### Slice 3: Wire Backend Selection Into Startup

Add a Python configuration hook for auth session storage:

```python
config.auth_session_backend = auto_auth_session_backend
config.auth_session_backend = FileAuthSessionBackend(path=...)
config.auth_session_backend = InMemoryAuthSessionBackend()
```

This should be a backend object or backend factory rather than separate settings such as `auth_session_backend=file` and `auth_session_file_path=...`. That keeps the API aligned with the actual extension point and avoids parallel configuration fields that can drift out of sync.

`auto_auth_session_backend` should be conceptually similar to uvicorn's `auto` loop factory: a named default that returns the best concrete implementation for the runtime context, while concrete choices remain available for users who need control. It should be called once during startup, not on every auth operation, so a running process has a stable concrete backend.

The factory does not need a new large context object. It can accept the existing Dara runtime `Configuration` and the built-in factory can read the existing runtime flags from environment variables, such as `DARA_LIVE_RELOAD`, `DARA_DOCKER_MODE`, and `DARA_PRODUCTION_MODE`. User-defined factories can inspect the configuration object and read environment variables directly when needed:

```python
def custom_auth_session_backend(config: Configuration) -> AuthSessionBackend:
    return FileAuthSessionBackend(path=...)
```

`FileAuthSessionBackend(path=None)` should resolve its root internally:

1. explicit constructor path
2. `DARA_AUTH_SESSION_FILE_PATH`
3. default temp directory root

Selection order:

1. explicit concrete backend or explicit backend factory wins
2. `auto_auth_session_backend` plus local `--reload` resolves to `file`
3. `auto_auth_session_backend` otherwise resolves to `memory`

The CLI already records reload state through `DARA_LIVE_RELOAD`. Startup can combine that with `DARA_DOCKER_MODE` and `DARA_PRODUCTION_MODE` so the implicit file default only applies to local reload development. If file storage is explicitly selected outside local reload, allow it and log that raw auth session material is being persisted to disk.

Add tests around backend selection rather than only CLI parsing:

- default startup selects memory
- reload startup selects file
- explicit memory overrides reload
- explicit file is honored outside reload
- explicit custom factory receives `Configuration`, is called once during startup, and its returned backend is installed
- file backend uses explicit path before env path before default temp path
- production/docker plus reload does not implicitly select file
- selected backend is logged

### Slice 4: Move Local JWT Secret Persistence Out Of The Repo

Add `platformdirs` to `dara-core` dependencies and use it to resolve a Dara-owned user directory for development secrets.

Secret resolution should become:

1. configured `jwt_secret` from settings wins, regardless of whether it came from environment variables, `.env`, or another settings source
2. existing `.env` loading remains supported
3. local development without an explicit secret generates or reuses a Dara-owned local secret under the platform user directory
4. production/docker without an explicit secret keeps the current compatibility fallback, but logs a loud warning

The implementation should keep the runtime `Settings.jwt_secret` type as `str`. Missing-secret detection should be source-aware, not inferred from `settings.jwt_secret is not None`. For example, `get_settings()` can construct settings, inspect whether Pydantic considered `jwt_secret` provided, then patch the final settings object with the resolved development or fallback secret before returning it. That preserves a non-null runtime setting while still distinguishing configured sources from generated fallback values.

Preserve existing behavior where it matters for compatibility: if a deployment already has a generated `.env`, it continues to load normally. Existing `.env` loading and precedence for non-JWT settings should not change. Replace only the current behavior that creates new local development `.env` files for `JWT_SECRET`; use the platform user directory instead. If that directory cannot be created or written, do not mutate the project CWD as a fallback. Continue with the existing generated process secret behavior and log that local sessions will not survive restart until `JWT_SECRET` is configured or the Dara-owned user directory is writable.

Test cases:

- configured `JWT_SECRET` wins
- `.env` values still load
- `.env` non-JWT settings, such as `AUTH_SESSION_MAX_AGE_SECONDS` and `DARA_BASE_URL`, continue to load with current precedence when the dev JWT secret is generated or reused
- missing local development secret is generated once and reused across settings reloads
- missing local development secret does not create a new `.env` file
- changing the project CWD changes the dev secret scope
- unwritable dev-secret storage logs and falls back without mutating CWD
- production/docker missing `JWT_SECRET` does not fail startup, but emits the warning
- `DARA_TEST_FLAG` keeps the existing `.env.test`-over-ambient-env precedence for core settings

### Slice 5: End-To-End Reload Verification

Add one integration-level test around the behavior users actually feel:

- start with file session backend and stable dev secret
- create an auth session
- rebuild the backend/settings as a simulated reload would
- verify the opaque browser session token still resolves to the stored raw auth token
- remove the session and verify the next lookup fails after another simulated reload

This should be done without requiring a full uvicorn subprocess unless the existing test harness already makes that cheap. The important contract is process-restart continuity across backend and settings reconstruction.

### Slice 6: Docs, Warnings, And Changelog

Update public-facing docs only after the behavior exists:

- document the default backend behavior for `dara start --reload`
- document `config.auth_session_backend = FileAuthSessionBackend(...)` and the file backend path env override
- document that file sessions store raw auth token material and are local/single-host storage
- document where local dev JWT secrets live and that clearing that directory invalidates local sessions
- add a `## NEXT` changelog entry for `dara-core`

Run targeted validation first:

```fish
cd packages/dara-core
DARA_TEST_FLAG=True poetry run pytest tests/python/test_auth.py tests/python/test_oidc_auth.py tests/python/test_settings.py
```

Before PR, run the package-level checks required by the repo:

```fish
poetry anthology run lint
poetry anthology run format-check
```
