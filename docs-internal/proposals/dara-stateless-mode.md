# Dara Stateless / Distributed Mode Proposal

Status: Draft

## Summary

This proposal outlines a staged path from today's single-process assumptions in `dara-core` toward:

- multi-worker deployments on one box
- multi-box deployments behind a load balancer
- a "true stateless" mode where request handling and action execution do not depend on process-local runtime state

The proposal intentionally separates three different outcomes:

1. better horizontal utilization today
2. distributed-safe deployments with some constraints
3. a stricter future Dara model that defaults to stateless/distributed-safe behavior

The recommended path is incremental:

- first support sticky-session multi-worker deployments with shared secrets
- then externalize obvious local state behind adapters and add a websocket backplane
- then add a staged distributed mode with `off`, `warn`, and `enforce`
- only after that decide whether Dara should keep that model as an opt-in mode or use a Dara v2 to make stronger defaults

## Locked Decisions

The following should be treated as design decisions for this proposal rather than open alternatives.

### Websocket Routing

Dara should use a websocket backplane.

This is required for:

- cross-worker send-to-channel
- send-to-user fanout
- broadcast
- shared presence

The target distributed-safe websocket backplane does not need to support browser value-read RPC. Browser roundtrip reads are a compatibility feature, not part of the `enforce` contract.

The canonical first implementation is app workers owning their own websocket connections plus a shared backplane for routing. A separate websocket service is not the default design.

### Browser Roundtrip Reads

`get_current_value()` is not part of the distributed-safe contract when it requires asking the browser for the current value of a variable.

The decision is:

- `off` mode keeps today's behavior
- `warn` mode allows `get_current_value()` but warns whenever resolution requires browser / websocket RPC
- `enforce` mode errors when `get_current_value()` would require browser / websocket RPC
- `enforce` mode may still allow direct reads from distributed-safe server-side backends where no browser RPC is involved

The common app patterns that use `get_current_value()` should be treated as anti-patterns in distributed mode:

- actions reading current UI state should receive that state as explicit action inputs instead
- backend services or tools reading UI state should receive explicit inputs or move the source of truth server-side
- server code reading a backend-backed value through `get_current_value()` should read the backend directly

The narrow compatibility use case is notebook / kernel-style execution, where code running outside the Dara app process needs a way to retrieve UI values from the active frontend. That use case can remain in non-distributed mode and may require an explicit opt-out from the v2 distributed-safe default, but it should not force browser RPC into the distributed websocket backplane.

### Shared State Backends

OIDC transaction state, token caches, cache/task metadata, websocket presence, and backend store state should move behind explicit adapters.

Dara should ship at least one first-party distributed backend, such as a Valkey / Redis adapter set, and distributed mode should reject the built-in local-only defaults.

The public configuration API should be feature-driven while the implementation protocols should be capability-driven.

The tentative user-facing entrypoint is `config.configure_runtime(...)`, with final naming still subject to API design review. The shape should support:

- easy mode: one first-party `ValkeyDistributedBackend(...)` bundle wires the common distributed runtime
- medium mode: users override a reusable capability such as key-value, sequenced state, pub/sub, presence, or task queue once and Dara reuses it for all compatible features
- expert mode: users override a specific Dara feature store such as static kwargs, OIDC transactions, backend stores, websocket presence, or task results

Override precedence should be:

1. feature-specific override
2. capability-level override
3. bundled backend default
4. built-in local default, only outside distributed `enforce`

This keeps common setup short while avoiding a single mandatory mega-adapter.

Example shape:

```python
config.configure_runtime(
    backend=ValkeyDistributedBackend(...),
    task_queue=CeleryTaskQueue(...),  # feature-specific override
)
```

Capability protocols should be grouped by storage semantics, not by every individual Dara feature. Expected base protocols include:

- `KeyValueStore` for simple TTL-backed entries such as static kwargs, OIDC transactions, token caches, and manifest fingerprints
- `SequencedStore` for backend-owned value + sequence/version state used by `BackendStore` and `ServerVariable` backends
- `PubSubBackplane` for websocket fanout and broadcast
- `PresenceStore` for websocket channel/session/user ownership leases
- `TaskQueue` and task `ResultStore` for distributed task execution

### Static Kwargs

Static kwargs should remain a supported mechanism in distributed mode, but only in serialized form behind a shared adapter.

The contract should be:

- all static kwargs must be serializable through Dara's built-in encoders, Pydantic model handling, or `config.add_encoder(...)`
- all static kwargs must have a declared type contract Dara can use to deserialize them on another worker
- distributed mode should validate this when the action or py_component instance is created
- the backing `static_kwargs_registry` should move behind an adapter, with a first-party Valkey / Redis implementation
- stored entries should be treated as short-lived invocation/render metadata and should use TTL-based cleanup

This keeps the current programming model while removing the in-process live-object dependency.

### Runtime-Created Definitions

True stateless / distributed-safe mode should not support definitions that are created dynamically at request or render time.

That includes patterns such as:

- defining a new `@py_component` inside another `@py_component`
- defining a new `@action` inside request-time or render-time code
- any definition whose identity only exists on the worker that happened to execute that code path

These patterns can continue to exist in normal mode, but should be warned on in `warn` mode and rejected in `enforce` mode.

In simple terms, Dara should enforce this by lifecycle rather than by trying to statically analyze arbitrary Python:

- during app import, router compilation, and startup, framework-owned definitions may register normally
- once Dara finishes building the application definition graph, distributed-relevant registries are marked as frozen
- after that point, any new action, py_component, derived variable, or similar definition registration is treated as runtime definition creation

In `warn` mode:

- Dara should log a warning when a new distributed-relevant definition is registered after registry freeze
- Dara should also warn when framework-owned decorators are invoked inside render/request/action context, because that strongly suggests a runtime-created definition is about to appear

In `enforce` mode:

- registries for distributed-relevant definitions should reject new entries after freeze
- framework-owned decorators and registration paths should fail immediately with a clear error explaining that runtime-created definitions are unsupported in distributed mode

This does not ban arbitrary dynamic Python in general. It bans the unsupported patterns that pass through Dara's own definition and registration APIs, which is the framework contract that distributed mode can realistically enforce.

### Task System

The first distributed-safe task model should split task execution into pluggable backends and explicitly disallow the local-only backend in distributed `enforce` mode.

The v1 shape should be:

- app workers remain responsible for orchestrating task graphs for actions and DerivedVariables
- only leaf `Task` executions are offloaded to the distributed task backend
- a first-party distributed backend should provide queueing plus task state/result storage, with a Valkey / Redis implementation as the default candidate
- task workers should run the same Dara/app image with a worker entrypoint rather than a separate codebase
- the initial distributed task codec may use pickle as an internal trusted same-image protocol for task payloads and results

This keeps the first version simple and aligned with the current `TaskPool` mental model. It also makes the trust boundary explicit: tasks are for coarse-grained compute-heavy work where the serialization overhead and same-image coupling are acceptable.

The current in-memory coordination pattern, where live `PendingTask` objects are stored in cache, is not part of the distributed-safe contract and must be replaced with shared serializable task state/handles.

### ServerVariable

`ServerVariable` should remain part of Dara's distributed-safe story, but its role needs to be narrowed and its documentation repositioned.

The intended use cases should be:

1. Large tabular data kept off the client.
2. Global or per-user server-owned mutable state.
3. Arbitrary live in-process Python objects.
4. Custom backend views over external systems such as databases or APIs.
5. Reactive server-triggered updates pushed to connected clients.

In distributed `enforce` mode, use cases 1, 2, 4, and 5 should remain supported through the existing backend model:

- the default in-memory backend should be rejected
- a distributed-safe backend must be provided
- the variable must have a stable `uid`
- backend state and synchronization versioning must live in shared storage
- websocket fanout should use the websocket backplane

This means:

- large datasets can remain in server-side storage and be exposed through `read_filtered`
- global/user-scoped shared state can live in a distributed backend
- custom backends over databases or APIs are already the correct shape
- when the real source of truth already lives in a database or service, the preferred migration is a custom backend that reads from that source directly rather than keeping an in-memory mirror in `ServerVariable`
- reactive synchronization still works as long as the backend provides a shared sequence/version and Dara routes notifications through the backplane

Use case 3 cannot be part of the distributed-safe contract.

Arbitrary live in-process objects such as database connections, ML model instances, or other runtime handles cannot be reconstructed on another worker just from backend state and variable metadata. They are process-local infrastructure, not distributed application state.

So the distributed-safe position should be:

- `ServerVariable` stays
- distributed `enforce` rejects the default `MemoryBackend`
- distributed `enforce` requires a non-local, distributed-safe backend
- distributed `enforce` does not support using `ServerVariable` as a holder for arbitrary live process-local objects
- Dara v2 should keep `ServerVariable` as the normal distributed-safe server-owned state primitive rather than introducing a new primary type
- local-only `ServerVariable` behavior is supported only through the explicit non-distributed / local-compatibility escape hatch

Docs should be updated accordingly. In particular, Dara documentation should stop presenting `ServerVariable` as a generic place to keep arbitrary Python objects and instead describe it as:

- backend-backed server-owned state
- suitable for large data, shared mutable state, and custom backend integrations
- for state that already lives in a database or service, best implemented as a custom backend over that source of truth rather than a process-local cache
- not limited to JSON-serializable values, but required to use a distributed-safe backend in distributed mode
- not a supported mechanism for process-local live-object state in distributed deployments

### Stable Identity Scope

Stable IDs should be solved for framework-owned definitions that exist at import / compile time.

The target contract is:

- top-level actions, py_components, derived variables, stores, and similar definitions must have cluster-stable identity
- per-instance and per-execution correlation IDs can remain ephemeral
- runtime-created definitions are outside the distributed-safe contract

Operationally, this means Dara should treat "distributed-relevant definition creation after startup" as the boundary. If a backend-visible definition did not exist by the time the app finished compiling, it is not part of the distributed-safe graph.

This does not ban all dynamic UI state. Creating ordinary ephemeral `Variable` objects inside a `py_component` remains supported for browser/session-local form state. Dynamic forms commonly need to create local input state for fields generated from a schema, and that state can remain random and render-scoped as long as it is submitted explicitly to actions and does not require server-side lookup by stable UID.

In practice, the ID policy should be:

Cluster-stable IDs:

- top-level `@action` definitions should use deterministic IDs derived from stable code identity such as module path and qualified name
- top-level `@py_component` definitions should use deterministic IDs derived from stable code identity such as module path and qualified name
- `DerivedVariable` definitions should require explicit stable `uid` values in distributed `enforce` mode
- `BackendStore` definitions should require explicit stable `uid` values in distributed `enforce` mode
- `ServerVariable` and similar backend-visible variable definitions should require explicit stable `uid` values in distributed `enforce` mode
- `Variable(..., store=BackendStore(...))` and similar persisted/backend-backed variables should require explicit stable `uid` values in distributed `enforce` mode

Ephemeral IDs:

- action instance IDs may remain random if they only key shared serialized static kwargs
- py_component instance IDs may remain random if they only key shared serialized static kwargs
- regular component instance IDs may remain random UI-instance identifiers
- ordinary `Variable` instances used only as browser/session-local UI state may remain random, including variables created dynamically inside `py_component` form builders
- per-action execution IDs may remain random websocket correlation tokens
- websocket channel IDs, request/reply channel IDs, session IDs, and similar transport/session identifiers may remain random
- task IDs may remain random as long as task state is stored and routed through distributed-safe backends

So the explicit-ID rule is:

- Dara may infer IDs for framework-owned top-level decorators.
- Users must provide explicit IDs for backend-visible state/definitions that need to survive across workers or restarts.
- Ephemeral browser/session-local `Variable` state does not need explicit IDs.
- Dynamic `DerivedVariable`, `ServerVariable`, `BackendStore`, `py_component`, and other distributed-relevant definitions remain unsupported in `enforce` unless they are declared during app build/startup with stable identity.

Passing a plain ephemeral `Variable` as input to a `DerivedVariable` does not by itself make the input variable require a stable ID. The server resolves the `DerivedVariable` by the derived variable's stable UID, while ordinary input `Variable` values are resolved by the frontend and sent as values in the derived-variable request. The input variable needs a stable ID only if the server or a shared backend must later resolve that input by UID.

So, for `DerivedVariable` inputs:

- plain browser/session-local `Variable` inputs may remain ephemeral
- `ServerVariable` inputs require stable IDs
- nested `DerivedVariable` inputs require stable IDs
- backend-backed `Variable(..., store=BackendStore(...))` inputs require stable IDs
- any input value that is already sent as a concrete serialized value does not require a stable variable identity

This preserves common dynamic form patterns while making the distributed boundary explicit. Longer term, Dara should improve form APIs so dynamic forms can submit structured payloads or bind to one backend-backed state object keyed by stable field IDs instead of creating many backend-visible variables at render time.

### Build-Time Manifest

Dara should generate a build-time manifest artifact as the source of truth for distributed-safe definition identity.

The manifest should be emitted by the Dara-controlled app build step alongside frontend assets. Runtime should load the artifact and validate that the imported app graph matches it.

The manifest's primary purpose is validation and diagnostics, not runtime lookup from a shared cache. It should:

- detect random or unstable stable-definition IDs
- detect duplicate or colliding IDs
- verify that runtime definitions match the built app graph
- provide source locations and clear diagnostics for incompatible distributed-mode definitions
- capture signature and type metadata needed to validate serialized static kwargs and deserialization contracts

The full manifest should live with the application artifact or image. Valkey / Redis should not be the manifest source of truth.

In distributed `enforce` mode, workers should publish or check only a small manifest fingerprint in the shared backend, keyed by app/deployment identity. Startup should fail or mark the worker unhealthy if another live worker for the same deployment reports a different fingerprint.

Manifest fingerprint checks should be deployment-scoped, not app-global. Each runtime should identify itself with an `app_id` plus a `deployment_id` or `build_id`, and workers should compare fingerprints only within that deployment scope.

This supports normal rolling deployments without requiring every old worker to disappear before a new worker can start. Dara v1 should not attempt multi-version manifest compatibility. If a client request/action carries or implies an old manifest version and lands on a worker running a different deployment, the request should be rejected or require a page refresh rather than translated across manifests.

Client/runtime identity should be sent with every Dara internal request. The initial HTML should include `app_id`, `deployment_id` / `build_id`, and `manifest_hash` in Dara's frontend config. The shared JS request helper should attach those values as headers on all internal API requests. Websocket connection setup should send the same runtime identity.

In distributed `enforce`, a worker that receives a request from a different runtime identity should return a typed mismatch response, for example:

- HTTP status: `409 Conflict`
- error code: `DARA_RUNTIME_MISMATCH`
- message: "This app was updated. Reload to continue."

Dara should not try to route the request to an old deployment and should not translate across manifests. The frontend should handle this as a reload-required condition. The preferred UX is a simple full-page reload flow with a visible message rather than a small dismissible prompt: the app may already be partially broken, and this should be rare in healthy deployments.

The reload should preserve the current URL where possible. If there is unsaved browser-local state, Dara cannot guarantee preserving it across incompatible deployment versions.

Operationally:

- `{app_id, deployment_id}` identifies the manifest fingerprint scope
- multiple deployments may overlap during rolling deploys
- the load balancer/orchestrator is responsible for draining or routing old sessions appropriately
- long-lived clients are not guaranteed to survive incompatible deployment changes without refresh
- Dara does not store the full manifest in Valkey / Redis and does not perform cross-version definition translation in v1
- runtime mismatch handling is refresh/reload, not old-deployment routing

So the contract is:

- full manifest: local build artifact
- runtime: validates imported app graph against local manifest
- shared backend: stores only deployment-scoped manifest version/build ID/fingerprint for cluster consistency
- dev mode: may auto-generate the manifest as a convenience, but `enforce` treats the manifest as required

## Why This Is Hard

The main blocker is not Redis itself. The harder issue is that Dara currently assumes that the process which rendered or registered something is also the process which later resolves or executes it.

Current examples include:

- process-local registries of Python objects and function resolvers
- frontend-visible IDs generated with `uuid4()` at runtime
- action instance IDs used as keys into `static_kwargs_registry`
- websocket ownership tracked in local registries
- request/response RPC over websocket for browser-held values
- server variables explicitly allowing arbitrary Python objects

So "add Redis" is not enough on its own. Some parts can be adapterized directly. Others require constraints or redesign.

## Goals

- Allow multiple Dara workers behind a load balancer.
- Improve multicore utilization without requiring a single giant process.
- Support multi-box deployments with shared state backends.
- Provide a clear migration path for existing apps.
- Make distributed-safety visible and enforceable where the framework owns the surface.

## Non-Goals

- Make arbitrary user Python objects magically serializable or portable.
- Guarantee that all user-defined custom adapters are actually distributed-safe.
- Eliminate every stateful API in one step.
- Require a Dara v2 before any meaningful scaling improvements are possible.

## Deployment Targets

### 1. Sticky-Session Horizontal Scale

Multiple Dara workers can serve different users or sessions, while each session stays pinned to one worker.

This gives:

- better multicore usage
- multiple workers per box
- multiple boxes with an L7 load balancer
- fewer changes to current Dara semantics

This does not give:

- stateless request handling
- free rerouting of a session to another worker
- robustness to a worker disappearing mid-session

### 2. Distributed-Safe Mode

Multiple Dara workers can serve the same app without relying on process-local state for correctness, as long as the app stays within a constrained feature set.

This requires:

- externalized shared state
- websocket backplane
- stable lookup identities for framework-owned definitions
- detection or prohibition of local-only features

### 3. True Stateless Mode

Any request or action can land on any worker without relying on process-local runtime state, and rolling deploys / restarts are safe within the defined contract.

This is the hardest target and likely requires the strongest constraints.

## Current Problem Areas

### 1. Local Registries Of Live Python Objects

Several registries store values that only exist in one process, including:

- action resolvers
- upload resolvers
- static kwargs
- websocket ownership
- session auth token cache
- OIDC transaction and ID-token caches
- backend store instances

Some of these can move behind adapters. Some cannot, because they store live callables or bound objects.

### 2. Frontend-Visible Random IDs

Dara currently creates frontend-visible IDs at runtime for several things. These IDs are often used later to look up data in process-local registries.

There are three distinct ID categories:

- stable definition identity
- instance identity used during one render/load flow
- per-execution correlation identity

Those should not all be treated the same.

### 3. Websocket Ownership And RPC

Dara's websocket layer is not just a transport. It currently owns:

- channel ownership
- user/session presence
- fanout to user channels
- custom inbound WS handlers
- request/response RPC such as browser value lookups

That means a shared backplane is needed even before Dara reaches fully stateless execution.

### 4. Local-Only Runtime APIs

Some APIs fundamentally rely on current process or current browser state, for example:

- local registries of static kwargs
- browser roundtrip reads via websocket
- arbitrary objects inside `ServerVariable`
- process-local sequence numbers in backend state

These either need to be banned in distributed mode, or redesigned.

## IDs: Deterministic Vs Required

There are two broad strategies for distributed-safe IDs.

### Option A: Deterministic IDs

Generate the same ID on every worker from a stable input, such as:

- module path + qualified name
- route path + component position
- explicit manifest path
- stable normalized serialization of a definition

Pros:

- easier migration for users
- no need to annotate every action/component manually
- works well for framework-generated definitions

Cons:

- hard to guarantee stability when code structure changes
- fragile for repeated dynamic construction
- difficult when identity depends on ordering or closures
- can create accidental collisions unless the input is very carefully defined

### Option B: Required Explicit IDs

Require the user or framework to provide a stable ID for distributed-sensitive definitions.

Pros:

- simpler model
- easier to reason about rolling deploy safety
- avoids pseudo-stability from heuristics

Cons:

- more migration burden
- worse ergonomics
- easy to underuse unless strongly integrated into framework APIs

### Recommended Position

Use both, depending on the surface:

- deterministic IDs for framework-owned definitions that exist at import / compile time
- explicit required IDs only where deterministic identity is too weak or ambiguous, not as the default model
- keep per-execution IDs random and ephemeral

The important distinction is that not every ID must be deterministic. Only IDs that must survive crossing workers need stable meaning.

### Opinionated Resolution

For distributed mode, Dara should assume that cluster-stable identity is only available for import-time definitions.

That means:

- a manifest or deterministic-ID scheme is the solution for top-level definitions
- nested composition is fine if it invokes already-defined top-level py_components/actions
- dynamically defining new decorated functions during render or request handling is not compatible with true stateless execution

In other words: a manifest cannot save definitions that only come into existence on one worker after render-time code runs. Those should be banned from `enforce` mode rather than supported through increasingly fragile heuristics.

## What Can Be Enforced Now

These changes largely fit the current architecture.

### Adapterize And Ban Default Local Backends In Distributed Deployments

In distributed mode Dara can require non-local implementations for:

- OIDC transaction store
- OIDC ID-token cache
- session auth token cache
- cache/task metadata storage
- websocket presence and routing metadata

This does not prove a custom adapter is correct, but it does remove the built-in local-only defaults.

### Require Shared Secrets And Startup Capability Checks

Dara can fail startup in distributed mode unless:

- JWT/session signing config is explicitly shared
- required adapters are present
- configured backends advertise required capabilities

### Validate Serializable Static Inputs

Dara can detect and warn or fail when framework-owned payloads contain obviously non-serializable static values.

This is especially useful for:

- static action kwargs
- py component inputs
- backend store payloads

For static kwargs specifically, this should become part of the distributed-mode contract rather than a best-effort warning.

In practice `enforce` mode should reject static kwargs when:

- the target parameter is untyped
- the declared type is too weak to deserialize safely, such as `Any` or `object`
- no matching serializer / deserializer is registered for the declared type
- the runtime value does not satisfy the declared type contract

### Mark Known Local-Only APIs As Unsupported

Dara can explicitly mark certain APIs as unsupported in distributed mode, for example:

- browser roundtrip value reads
- default local cache/task stores
- server variables storing arbitrary Python objects

## What Needs Redesign

These go beyond swapping adapters.

### Stable Definition Identity

Action definitions, derived variables, py components, stores, and similar framework-owned definitions need identities that mean the same thing on every worker.

This is the area where a manifest or stable ID scheme is most important.

This only works for definitions Dara can discover before handling traffic. If a definition is created dynamically inside another handler, there is no cluster-stable object to map to.

### Remove Server-Side Dependence On Instance Registries

Today some frontend-visible instance IDs are only useful because the server later uses them as keys into local registries.

That pattern needs to be replaced with one of:

- serializable inline payloads
- stable definition lookup plus explicit serialized arguments
- manifest-driven resolution

For py_components and actions this implies:

- definition lookup should use stable definition identity
- request payloads should carry only serializable arguments and invocation metadata
- server-side lookup by random instance ID is acceptable for static kwargs if the backing store is shared and stores serialized values rather than live Python objects

### Websocket Backplane

Dara needs a backplane for:

- cross-worker send-to-channel
- send-to-user fanout
- global broadcast
- presence tracking

It should not implement browser value-read RPC as part of the target distributed-safe model. Compatibility modes may keep local/browser RPC behavior, but `enforce` should reject APIs that depend on it.

The canonical first version is not a separate websocket service. It is app workers owning their own sockets plus a shared backplane for routing.

This should be treated as settled architecture, not an open choice.

### Distributed Store Semantics

`BackendStore` and similar abstractions need cluster-wide semantics for:

- sequence numbers
- concurrency
- ordering
- invalidation/fanout

Local incrementing counters are not enough once multiple workers can write.

The distributed backend should own sequence/version state. Dara should not maintain process-local sequence counters in distributed mode.

The minimum distributed store contract is:

- every successful write increments a backend-owned monotonic sequence/version
- value writes and sequence increments are atomic for one store key
- partial writes / patches are atomic per store key
- normal conflict behavior is last-write-wins unless a backend exposes an explicit stronger compare-and-set API
- cross-key transactions are not required in v1
- notifications happen after commit, and clients refetch against the committed sequence/version

First-party Valkey / Redis implementations should use atomic primitives or Lua where needed so value writes and sequence updates cannot diverge. Users that need stronger multi-key transactional semantics should provide a custom backend over a database that supports those guarantees.

### ServerVariable Contract

`ServerVariable` currently allows arbitrary Python objects. That is not compatible with stateless/distributed execution.

The framework should enforce a stricter contract in distributed mode rather than trying to replicate arbitrary objects across workers or introducing a new primary distributed-safe type.

Given the existing backend abstraction, the path is to keep `ServerVariable` but narrow its supported semantics in distributed mode:

- non-local distributed-safe backend required
- stable `uid` required
- process-local live-object usage unsupported
- if the underlying state already lives outside Dara, a custom backend over that external source should be preferred over an in-memory mirror
- local-only behavior is available only through the explicit non-distributed / local-compatibility escape hatch

## Detectability Limits

Not everything is discoverable in Python, and the framework should not pretend otherwise.

The workable model is to separate three buckets:

### 1. Provably Safe

Framework-owned paths where Dara can verify the contract.

Examples:

- a required adapter type is present
- a value is JSON-serializable
- a local-only default backend is not being used

### 2. Known Unsafe

Framework-owned paths Dara can reject.

Examples:

- an unsupported local backend
- use of a banned API in distributed mode
- a non-serializable framework payload

### 3. User-Attested

Custom implementations that Dara cannot fully prove safe.

Examples:

- custom adapters
- user-defined serialization conventions
- external stores with looser guarantees

For these, Dara should validate interface shape and capability, but it cannot guarantee semantics.

## Proposed Migration Paths

These are not mutually exclusive.

### Path A: Sticky Sessions First

This is the fastest way to get operational benefit.

### Phase A1

- document supported sticky-session deployment shape
- require explicit shared signing secret
- move OIDC/session caches behind shared adapters where needed

### Phase A2

- support multiple workers and multiple boxes with sticky sessions
- keep current local registries and random IDs

Pros:

- quickest win
- low framework risk
- good answer for many current deployments

Cons:

- not stateless
- weaker failover
- still blocked on worker affinity

### Path B: Distributed Mode In Stages

This is the recommended main path.

### Phase B1: Externalize Obvious Local State

- adapterize caches and token/session support
- add startup capability checks
- reject built-in local defaults when distributed mode is enabled
- reject the local-only task backend when distributed mode is enabled

### Phase B2: Add Websocket Backplane

- shared presence store
- cross-worker channel routing
- user fanout
- broadcast

This enables distributed websocket correctness even before full statelessness.

### Phase B3: Add `distributed_mode = off | warn | enforce`

`off`:

- current behavior

`warn`:

- emit warnings for known unsafe or suspicious usage
- surface ID instability and local-only features
- warn when distributed-relevant definitions are registered after startup/compile
- warn when `get_current_value()` or equivalent APIs require browser / websocket RPC
- do not block startup

`enforce`:

- fail on unsupported backends
- fail on banned local-only APIs
- fail when `get_current_value()` or equivalent APIs require browser / websocket RPC
- require stable lookup identities where Dara needs them
- freeze distributed-relevant registries after startup/compile and reject any later registrations

This is similar in spirit to React Strict Mode, but with a real deployability contract behind `enforce`.

### Phase B4: Stable Definition Identity / Manifest Work

Introduce the build-time manifest artifact for framework-owned definitions.

Recommended direction:

- generate the manifest during the Dara-controlled app build step
- validate the runtime app graph against the manifest at startup
- publish/check only a manifest fingerprint through the shared backend in distributed `enforce`
- start with framework-generated deterministic IDs where Dara controls the structure
- restrict distributed mode to import-time discoverable definitions
- add explicit IDs only where ambiguity remains
- reject runtime-created definitions in `enforce` mode

The implementation should be straightforward:

1. build the app, compile the router, and emit the manifest artifact
2. at runtime, import the app and compile the router
3. validate the runtime app graph against the manifest
4. freeze registries for actions, py_components, derived variables, and similar distributed-relevant definitions
5. in distributed `enforce`, publish/check the manifest fingerprint in the shared backend
6. inject app/deployment/manifest identity into the initial frontend config
7. require internal API and websocket requests to carry that identity
8. reject mismatched runtime identity with a typed reload-required error
9. let normal request handling continue
10. if any framework-owned decorator or registration path attempts to add a new definition after freeze, warn or fail depending on mode

### Phase B5: Tighten Data Contracts

- ban arbitrary-object server values in distributed mode
- tighten backend store semantics
- reject browser roundtrip reads such as `get_current_value()` in distributed `enforce`
- replace in-memory `PendingTask` coordination with shared serializable task state/handles

At this point Dara starts approaching a real stateless contract rather than just distributed compatibility.

### Path C: Dara V2 Clean Break

A Dara v2 could choose stricter defaults up front, such as:

- distributed-safe mode as the default required contract
- explicit distributed-safe server value types
- stable IDs as a first-class design choice
- fewer process-local escape hatches
- no browser RPC for core state retrieval

The preferred migration story is that `distributed_mode = enforce` becomes the practical "Dara v2 compatible" contract before Dara v2 exists.

That would let Dara use the current major version to:

- introduce the stricter distributed-safe contract behind `enforce`
- warn or error on use of APIs that are deprecated or incompatible with that contract
- give applications a concrete target to migrate toward before any major-version cut

Then a future Dara v2 can be a cleaner flip of defaults rather than a second large redesign. In particular, Dara v2 should aim to:

- remove deprecated APIs that were already surfaced through warnings/errors in the current line
- remove the compatibility warning system that only exists to bridge old and new behavior
- default to the cleaner contract that `enforce` had already established
- require the distributed-safe contract by default, with an explicit opt-out flag for local-only compatibility

For narrow notebook / kernel scenarios that still need browser value reads, Dara v2 should provide an explicit non-distributed or local-compatibility escape hatch rather than making those APIs work inside the distributed-safe default. That escape hatch should be visibly non-scalable: it opts the app out of the distributed contract instead of weakening the default contract.

The tentative API should be deliberately explicit, for example `unsafe_runtime_mode="local"`. The name should communicate that the app is choosing process-local compatibility over the distributed-safe contract.

`unsafe_runtime_mode="local"` should allow simpler/in-process patterns such as:

- browser value reads through `get_current_value()`
- local-only `ServerVariable` / `MemoryBackend` usage
- local task execution
- process-local caches and registries
- runtime-created definitions where still supported by the non-distributed runtime

This mode should not claim general multi-worker or multi-box support. At most, it can scale through sticky-session routing where each user/session remains pinned to one worker and the deployment accepts weaker failover guarantees. Dara should document it as local compatibility mode, not as a horizontally scalable runtime mode.

Pros:

- cleaner model
- fewer compatibility hacks
- easier docs and support story

Cons:

- slower time to value
- forces a migration story anyway
- risks blocking practical scaling improvements behind a bigger rewrite

## Recommendation

Do not wait for a v2 to unlock horizontal scaling.

The practical recommendation is:

1. support sticky-session multi-worker deployments as an explicitly documented near-term shape
2. build shared adapters plus a websocket backplane
3. introduce staged distributed mode with `off`, `warn`, and `enforce`
4. do the stable-ID / manifest work for import-time framework-owned definitions and explicitly exclude runtime-created definitions
5. use what is learned there to decide whether Dara v2 should simply flip defaults, or make a cleaner break

This gives Dara near-term operational wins without pretending that all local-process assumptions can be solved by a cache adapter.

## Open Questions

- At what point does the cost of compatibility exceed the cost of a Dara v2 break?
