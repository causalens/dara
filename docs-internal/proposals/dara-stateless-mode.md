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
3. a stricter opt-in stateless/distributed-safe mode for apps that need stronger scaling guarantees

The recommended path is incremental:

- first support sticky-session multi-worker deployments with shared secrets
- then externalize obvious local state behind adapters and add a websocket backplane
- then add a staged distributed mode with `off`, `warn`, and `enforce`
- keep `off`, `warn`, and `enforce` as the long-term adoption model rather than making statelessness mandatory

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

## Runtime Shapes

The proposal distinguishes three deployment/runtime shapes:

- sticky-session scale: multiple workers or boxes can serve different users/sessions, but each live session remains pinned to one worker
- distributed-safe mode: multiple workers can serve the same app without relying on process-local state for correctness, within the enforced feature contract
- true stateless mode: any compatible request/action can land on any worker in the same deployment without process-local runtime dependency

Sticky sessions are a useful near-term operational shape because they improve multicore and multi-box utilization with fewer framework changes. They are not the target distributed contract because they do not provide free rerouting, strong failover, or stateless request handling.

Distributed-safe mode is the main target for this proposal, but it should remain an opt-in higher bar. Apps can stay on lower-friction local or warning modes unless they want the performance, failover, and scaling properties unlocked by `enforce`.

## Current Problem Areas

The central issue is not the absence of Redis / Valkey. The central issue is that Dara currently assumes the process that defines, renders, stores, or owns something is usually the same process that later resolves, executes, updates, or notifies it.

This section is the problem inventory. Later sections lock the proposed solutions.

### 1. Process-Local Definition And Resolver State

Dara has framework-owned registries that map frontend or request-visible identifiers back to Python callables, resolver objects, or component definitions in the current process.

Known affected surfaces include:

- action resolver registration and lookup
- upload resolver registration and lookup
- py_component definition registration and lookup
- DerivedVariable definition registration and lookup
- backend-visible variable/store definition registration and lookup
- custom websocket handler registration and dispatch

The problem is not that every worker has Python functions in memory. Every worker will. The problem is when the identifier used by the client or another worker is random, late-created, or otherwise not guaranteed to resolve to the same definition on every worker.

### 2. Process-Local Runtime Data Stores

Dara also keeps runtime data in local memory where another worker cannot see it.

Known affected surfaces include:

- `static_kwargs_registry`
- OIDC transaction state
- OIDC ID-token cache
- session auth token cache
- cache/task metadata storage
- websocket channel ownership
- websocket session/user presence
- backend store in-memory state
- `ServerVariable` in-memory backend state
- local task state and live `PendingTask` coordination

Some of these are ordinary key-value or sequenced stores and can move behind adapters. Others currently contain live Python objects and need stronger constraints before they can be shared.

### 3. Frontend-Visible Identity With Mixed Semantics

Dara uses frontend-visible IDs for several different purposes, but not all IDs need the same stability.

The problematic cases are IDs that cross a worker boundary and are later used for server-side lookup. That includes:

- action definition IDs
- py_component definition IDs
- DerivedVariable UIDs
- BackendStore UIDs
- ServerVariable UIDs
- backend-backed Variable / store UIDs
- action or py_component instance IDs when they are used to retrieve server-side static kwargs

The less problematic cases are IDs that are only transport/session correlation. Those can remain ephemeral if the state they point at is in a shared backend or is included directly in the request.

The current code does not make this distinction consistently, which makes it hard to know whether a random ID is harmless or a hidden single-process dependency.

### 4. Runtime-Created Distributed Definitions

Dara supports patterns where a request-time or render-time code path creates new framework definitions.

Known risky patterns include:

- defining `@py_component` inside another `@py_component`
- defining `@action` inside render/request/action code
- creating DerivedVariables dynamically during render
- creating ServerVariables dynamically during render
- creating BackendStores or backend-backed Variables dynamically during render

These definitions only exist on the worker that executed the code path. A manifest or deterministic ID scheme cannot make another worker resolve a definition that was never created there.

Ordinary browser-local `Variable` instances created dynamically for forms are a different case. They are not a distributed definition as long as they stay browser/session-local and are submitted as values rather than looked up by backend UID.

### 5. Websocket Ownership, Presence, Fanout, And RPC

Dara's websocket layer is both a transport and a local ownership registry.

Known affected surfaces include:

- channel-to-worker ownership
- session and user presence
- send-to-channel
- send-to-user fanout
- broadcast
- custom inbound websocket handlers
- request/reply flows over websocket
- browser value reads used by `get_current_value()`

Without a backplane, one worker cannot reliably send to a socket owned by another worker. Separately, browser value-read RPC is not a good distributed contract because it depends on reaching the right live browser connection at request time.

### 6. Backend State Semantics

`BackendStore`, `ServerVariable`, and related abstractions need cluster-wide semantics when multiple workers can read and write.

Known affected concerns include:

- sequence/version ownership
- atomic value + sequence updates
- partial writes and patch ordering
- conflict behavior
- invalidation and client refetch
- websocket notifications after state changes
- backend-owned synchronization versions for ServerVariable

Local incrementing counters and process-local invalidation are not enough once writes can happen from more than one worker.

### 7. Task Execution And Result Coordination

The current task model has local execution and local coordination assumptions.

Known affected surfaces include:

- local process-pool style execution
- live task objects stored in local cache
- task graph orchestration coupled to the app worker
- task result lookup
- task cancellation/status propagation
- serialization of task payloads and results

Distributed mode needs a queue/result backend and serializable task handles. It does not need to move all orchestration away from the app worker in the first version.

### 8. Serialization And Type Contracts

Distributed workers can only exchange values that can be serialized and deserialized with enough type information.

Known affected surfaces include:

- static action kwargs
- static py_component kwargs
- task payloads and results
- backend store payloads
- ServerVariable backend values
- custom encoder / decoder registration
- Pydantic model handling

JSON-serializability is not the only acceptable standard, but "live object in this process" cannot be part of the distributed contract. Dara needs to know which serializer/deserializer and type contract apply when another worker reads the value.

### 9. Auth, Session, And Shared Secret Configuration

Multi-worker deployments require configuration and auth state to be shared consistently.

Known affected surfaces include:

- JWT/session signing secret configuration
- OIDC transaction state
- OIDC ID-token cache
- session auth token cache
- cookie/session verification behavior

If these remain per-process, sticky sessions may hide the issue for happy-path traffic, but failover and cross-worker requests remain unsafe.

### 10. Deployment And Manifest Consistency

Even if every worker is distributed-safe, a client can still talk to a worker running a different build during rolling deployment.

Known affected surfaces include:

- build-time definition manifest
- manifest fingerprint
- app/deployment/build identity
- internal HTTP request headers
- websocket connection identity
- client behavior when runtime identity mismatches

Dara needs a clear contract for same-deployment consistency and a simple failure mode for incompatible deployment mismatches.

### 11. Detectability And User Extension Limits

Python makes it impossible to prove every user implementation is distributed-safe.

Known limits include:

- arbitrary custom adapters
- custom serializers
- external stores with weak consistency
- user code that hides process-local state behind a safe-looking interface
- arbitrary live Python objects such as database connections, model instances, and runtime handles

Dara can enforce the contracts it owns, reject known local-only defaults, and require adapters to advertise capabilities. It cannot prove that every custom implementation has correct distributed semantics.

## Locked Decisions

The following should be treated as design decisions for this proposal rather than open alternatives.

### Runtime Strategy And Modes

Dara should not wait for a v2 rewrite to unlock horizontal scaling. The main path should be incremental:

1. document sticky-session multi-worker deployment as the near-term scale shape
2. externalize obvious local state behind adapters
3. add the websocket backplane
4. add `distributed_mode = off | warn | enforce`
5. add stable definition identity and build-time manifest validation
6. tighten data contracts inside `enforce` without making `enforce` the mandatory default

The mode semantics should be:

- `off`: default compatibility behavior for apps that do not need distributed-safe guarantees
- `warn`: adoption/audit mode that allows the app to run but warns on known unsafe or suspicious distributed-mode usage
- `enforce`: opt-in high-bar mode that fails startup or fails the operation when the app violates the distributed-safe contract

`warn` should cover:

- local-only built-in backends
- missing or incomplete runtime scope for shared distributed backends
- custom distributed adapters that do not advertise scoped-key support
- unstable or missing required IDs
- distributed-relevant definitions registered after startup/compile
- `get_current_value()` or equivalent APIs that require browser / websocket RPC
- static kwargs or framework payloads that cannot be serialized/deserialized under a declared type contract

`enforce` should reject:

- unsupported local-only backends
- shared backend configuration without an explicit framework-owned runtime scope
- feature adapters that construct or accept unscoped raw backend keys
- banned local-only APIs
- browser roundtrip reads for core state resolution
- missing stable lookup identities where Dara requires them
- distributed-relevant registry writes after startup/compile freeze
- runtime payloads that do not satisfy their serializer/type contract

Rejected alternatives:

- sticky sessions only: useful operationally, but not enough for worker failover or stateless request handling
- separate Dara v2 first: cleaner eventually, but it blocks practical scaling improvements behind a larger migration
- making `enforce` mandatory in v2: raises the adoption floor too much and makes statelessness a breaking requirement even for apps that do not need it
- one-shot "make everything stateless" rewrite: too broad and unnecessary before adapters, backplane, and identity constraints are proven

### Enforcement And Detectability Model

Dara should enforce what the framework owns and explicitly classify the rest as user-attested.

Provably safe framework-owned checks include:

- required adapters are configured
- built-in local-only defaults are not used in `enforce`
- shared signing/session configuration is explicit
- shared backend keys are produced by Dara's scoped-key builder
- values pass the configured serializer/type contract
- distributed-relevant registries are frozen after startup/compile

Known unsafe framework-owned paths should be rejected in `enforce`, including:

- unsupported local backends
- banned browser roundtrip reads
- non-serializable framework payloads
- runtime-created distributed definitions

Custom adapters, custom serializers, and external stores are user-attested. Dara should validate interface shape and advertised capabilities, but it cannot prove that a user implementation has correct distributed semantics.

### Websocket Routing

Dara should use a websocket backplane.

This is the canonical self-hosted scale-out pattern for websocket frameworks because each websocket connection is physically attached to one process/node, while the application still needs cross-node fanout and routing.

The normal architecture is:

- each app worker owns the websocket connections that terminated on that worker
- local sends go directly to locally owned sockets
- cross-worker sends are published into a shared backplane
- each worker consumes relevant backplane messages and delivers them to its own local sockets

This is required for:

- cross-worker send-to-channel
- send-to-user fanout
- broadcast
- shared presence

This is not an unusual Dara-specific choice. It is the common pattern used by several mainstream realtime stacks:

- Socket.IO commonly scales with the Redis adapter so multiple servers can emit to rooms/sockets across instances
- Django Channels uses a Redis-backed channel layer as its official production cross-process messaging mechanism
- Phoenix Channels uses Phoenix.PubSub to route broadcasts across nodes while each node still owns its local sockets
- ASP.NET Core SignalR documents Redis backplane scale-out for self-hosted deployments and separately offers a managed SignalR service when you want to externalize connection ownership entirely

The target distributed-safe websocket backplane does not need to support browser value-read RPC. Browser roundtrip reads are a compatibility feature, not part of the `enforce` contract.

The canonical first implementation is app workers owning their own websocket connections plus a shared backplane for routing. A separate websocket service is not the default design.

Rejected alternatives:

- no backplane: incompatible with cross-worker websocket ownership, fanout, and broadcast
- separate websocket routing service as v1 default: possible later, but unnecessary for the first distributed-safe design and more operationally complex

A separate websocket service could work like this:

- a dedicated realtime tier terminates all websocket connections
- Dara app workers no longer own client sockets directly
- app workers publish outbound events/commands to that realtime tier through a broker or RPC boundary
- the realtime tier owns channel membership, presence, and final delivery to clients

That architecture can make sense when:

- websocket traffic dominates the system and deserves an independently scaled tier
- connection count is much larger than application compute needs
- the team wants to reuse one shared realtime edge across multiple backend services
- a managed realtime service is being used instead of app-owned sockets

The tradeoff is extra complexity:

- a second deployable service or service tier
- a new internal protocol between Dara and the realtime tier
- duplicated auth/session and runtime-identity concerns across tiers
- more operational coordination during deploys, rollouts, and incident handling
- more work to preserve Dara-specific semantics such as action correlation, presence, and backplane-triggered updates

So the decision is not that a separate websocket tier is wrong. It is that for Dara v1 distributed mode, the simpler and more standard self-hosted architecture is app-owned sockets plus a shared backplane.

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

The narrow compatibility use case is notebook / kernel-style execution, where code running outside the Dara app process needs a way to retrieve UI values from the active frontend. That use case can remain in `off` mode, but it should not force browser RPC into the distributed websocket backplane.

### Shared State Backends

OIDC transaction state, OIDC ID-token cache, session auth token cache, cache/task metadata, websocket presence, and backend store state should move behind explicit adapters.

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
    scope=RuntimeScope(
        namespace='prod',
        app_id='sales-dashboard',
        deployment_id=os.environ['DARA_DEPLOYMENT_ID'],
    ),
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

#### Runtime Scope And Key Construction

Shared backend key scoping should be a framework-owned invariant, not a naming convention left to each feature adapter.

The easy path should be that users configure one `RuntimeScope` alongside the bundled distributed backend. Dara then derives every backend key from that scope:

```python
config.configure_runtime(
    scope=RuntimeScope(
        namespace='prod',
        app_id='sales-dashboard',
        deployment_id=os.environ['DARA_DEPLOYMENT_ID'],
    ),
    backend=ValkeyDistributedBackend(url=os.environ['VALKEY_URL']),
)
```

The minimum `RuntimeScope` fields should be:

- `namespace`: operator-chosen isolation boundary such as `dev`, `staging`, `prod`, customer, or tenant namespace when a shared backend cluster is reused
- `app_id`: stable application identity shared by all workers serving the same app
- `deployment_id` / `build_id`: stable identity for one deployed app artifact

Dara should construct typed scoped keys centrally, for example:

```text
dara:v1:{namespace}:app:{app_id}:feature:{feature}:...
dara:v1:{namespace}:deploy:{app_id}:{deployment_id}:feature:{feature}:...
```

The important part is not the exact string format. The important contract is that framework code works with a `ScopedKey` / `ScopedChannel` value produced by Dara, not an arbitrary Redis / Valkey string assembled by each feature.

Different features should choose the narrowest scope that preserves their semantics:

- deployment-scoped keys for same-image or build-sensitive state such as static kwargs, task payload/result blobs, action/DerivedVariable cached Python results, websocket presence, channel ownership, and manifest fingerprints
- app-scoped keys for state that is meant to survive a rolling deployment, such as durable `BackendStore` / `ServerVariable` values backed by a versioned serializer contract
- app-scoped or deployment-scoped auth/session keys depending on the token/cache contract; if the token format, JWT secret, and deserializer are deployment-independent, session token caches can be app-scoped, while OIDC transaction scratch state can usually be short-lived and deployment-scoped

Correctness guarantees:

- In `enforce`, Dara should require an explicit `RuntimeScope` whenever any shared distributed backend is configured.
- First-party bundled backends should receive only `ScopedKey` / `ScopedChannel` values from Dara's key builder.
- Feature-specific adapters should either receive already-scoped keys or declare that they implement Dara's scoped-key protocol.
- Custom adapters are user-attested for storage semantics, but not for namespace construction; Dara should still own and pass the scoped keys.
- Built-in tests for each first-party adapter should assert that keys for different runtime scopes cannot overlap. Deployment-scoped features must differ by `{namespace, app_id, deployment_id}`; app-scoped features intentionally omit `deployment_id` and must differ by `{namespace, app_id}`.
- Persistent app-scoped state should include a feature/schema version in the key or value envelope when the deserialization contract can change across deployments.

This keeps common setup short while making the isolation boundary explicit. Most users configure one scope and one backend. Advanced users can still override capabilities or individual feature adapters, but those adapters must participate in the same scoped-key contract before `enforce` accepts them.

Rejected alternatives:

- one mandatory mega-adapter: too rigid for users that need to override only one capability
- only feature-specific adapters: too repetitive for common Valkey / Redis deployments
- accepting built-in local defaults in `enforce`: would make distributed mode look enabled while still depending on process-local state
- letting each adapter manually prefix string keys: too easy to get subtly wrong and impossible for Dara to verify consistently

### Distributed Store Semantics

`BackendStore`, `ServerVariable`, and related abstractions need cluster-wide semantics for sequence/version ownership, atomic writes, invalidation, and fanout.

The distributed backend should own sequence/version state. Dara should not maintain process-local sequence counters in distributed mode.

The minimum distributed store contract is:

- every successful write increments a backend-owned monotonic sequence/version
- value writes and sequence increments are atomic for one store key
- partial writes / patches are atomic per store key
- normal conflict behavior is last-write-wins unless a backend exposes an explicit stronger compare-and-set API
- cross-key transactions are not required in v1
- notifications happen after commit, and clients refetch against the committed sequence/version

First-party Valkey / Redis implementations should use atomic primitives or Lua where needed so value writes and sequence updates cannot diverge. Users that need stronger multi-key transactional semantics should provide a custom backend over a database that supports those guarantees.

### Static Kwargs

Static kwargs should remain a supported mechanism in distributed mode, but only in serialized form behind a shared adapter.

The contract should be:

- all static kwargs must be serializable through Dara's built-in encoders, Pydantic model handling, or `config.add_encoder(...)`
- all static kwargs must have a declared type contract Dara can use to deserialize them on another worker
- distributed mode should validate this when the action or py_component instance is created
- bound action receivers and other live captured Python objects are not part of the distributed-safe contract; `warn` should flag them and `enforce` should reject them unless they satisfy the same explicit serialization/type contract as any other static kwarg
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

- app workers submit serializable task handles and subscribe to shared task state; they do not own live `PendingTask` orchestration in distributed `enforce`
- the distributed task backend owns orchestration state for actions, DerivedVariables, and leaf `Task` executions
- a first-party distributed backend should provide queueing, leasing/acks, task status, cancellation state, progress pub/sub, and task result storage, with a Valkey / Redis implementation as the default candidate
- task workers should run the same Dara/app image with a task-ingestion entrypoint rather than a separate codebase
- each task-worker replica should own an instance of the existing local process-pool executor
- total task parallelism should scale as task-worker replicas multiplied by process-pool size per replica
- the initial distributed task codec should use pickle as an internal trusted same-image protocol for task payloads and results

This keeps the execution mechanism simple and aligned with the current `TaskPool` mental model. The distributed backend decides which task-worker replica owns a task through queueing and leases; the existing process pool inside that replica remains the local execution engine.

Distributed `enforce` mode should not rely on sticky/session-affine task orchestration. Any app worker should be able to submit a task, observe task status, request cancellation, and read the final result through the shared backend. The backend should expose durable task records with states such as:

- `queued`
- `running`
- `cancelling`
- `cancelled`
- `succeeded`
- `failed`

Cancellation should be part of the v1 distributed contract because Dara currently cancels work when pages are navigated away from or subscribers disappear. The cancellation path should be:

1. any app worker records `cancel_requested` on the shared task record
2. the task backend publishes or exposes the cancellation request to the task worker that owns the lease
3. the owning task worker cancels its local `TaskPool` / subprocess work
4. the shared task record moves to `cancelled`, and subscribers are notified through the shared progress/pub-sub path

Duplicate work prevention for DerivedVariables and cached action results should also move to the backend. Instead of storing live `PendingTask` objects in `CacheStore`, distributed `enforce` should use backend-owned idempotency/cache keys that point to a durable task record or a completed result.

The implementation should preserve the existing task code path as the local orchestration backend rather than rewriting it wholesale. The preferred migration is:

1. introduce a narrow `TaskOrchestrationBackend` interface around submit, status, result, cancellation, progress subscription, and cache-key deduplication
2. adapt today's `TaskManager`, `PendingTask`, local `CacheStore`, websocket notification, cancellation-scope, and process-pool behavior behind a `LocalTaskOrchestrationBackend`
3. make `LocalTaskOrchestrationBackend` the default in `off` mode and reject it in distributed `enforce`
4. add a `ValkeyTaskOrchestrationBackend` that implements the same interface using shared task records, leases, progress pub/sub, cancellation flags, idempotency keys, and result storage
5. reuse the existing `TaskPool` inside each task-worker replica so the distributed implementation replaces orchestration and coordination, not the battle-tested local execution engine

`PendingTask` should therefore become a local-backend implementation detail. Framework code that needs to be distributed-safe should work with serializable task handles and task statuses returned by the orchestration backend.

The pickle trust boundary should be explicit. Pickle is acceptable for first-party distributed task execution because the app workers and task workers run the same trusted image. It is not a public cross-language, cross-version, or untrusted-payload protocol. Tasks remain a fit for coarse-grained compute-heavy work where serialization overhead and same-image coupling are acceptable.

The v1 baseline integrity model should be deployment identity validation rather than mandatory payload hashing/signing. Pickle-backed entries should be stored with non-pickle metadata that Dara can validate before unpickling. The metadata should include:

- entry kind, such as `task_payload`, `task_result`, `derived_variable_cache`, or `action_cache`
- `app_id`
- `deployment_id` / `build_id`
- `manifest_hash`
- codec identifier, such as `pickle-v1`
- metadata schema version

For binary-safe stores such as Redis / Valkey, the pickle payload should be stored as raw bytes rather than base64-encoded text. The metadata can be stored as JSON, msgpack, or another simple structured format, either adjacent to the payload or in a small typed envelope. Workers must validate the metadata first and reject the entry before unpickling when the app/deployment/manifest/codec/kind does not match the current runtime.

This is a correctness boundary, not a hostile-writer security boundary. The expected production deployment is that the shared queue/result/cache backend is private and authenticated so only Dara app workers and task workers can write these entries. If Dara needs to support untrusted or broadly shared backend writers later, signed runtime blobs can be added as an opt-in stronger mode, but v1 distributed `enforce` should not require SHA/HMAC over every arbitrary pickle payload.

The current in-memory coordination pattern, where live `PendingTask` objects are stored in cache, is not part of the distributed-safe contract and must be replaced with shared serializable task state/handles.

DerivedVariable and action cache/results need the same treatment. In distributed `enforce`, cached Python results that may be read by another worker should be stored through a distributed result/cache backend using the configured runtime codec. The v1 default can also be pickle for the same reason as task results: these values are arbitrary Python objects within a trusted same-image Dara deployment.

Because pickle-backed task payloads, task results, and cached Python results are same-image artifacts, their shared storage must be scoped by runtime identity. Distributed task queues, result stores, and action/DerivedVariable caches should include `app_id` and `deployment_id` / `build_id` in their keys or queue namespaces, and workers should reject or ignore entries from a different deployment identity. Dara should not let a new deployment consume old-deployment pickle payloads during a rolling release.

The cache/result backend contract should distinguish:

- task status and handles: structured metadata that should remain inspectable
- task payloads and results: pickle-backed v1 same-image blobs
- DerivedVariable/action cached results: pickle-backed v1 same-image blobs

Rejected alternatives:

- one global remote executor with no local process pool: more redesign than needed for v1 and throws away existing `TaskPool` behavior
- JSON-only task/cache results: too restrictive because Dara tasks and DerivedVariable results may be arbitrary Python objects
- live `PendingTask` objects in shared cache: impossible to make portable across workers

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
- Dara should keep `ServerVariable` as the normal distributed-safe server-owned state primitive rather than introducing a new primary type
- local-only `ServerVariable` behavior is supported only in `off` mode

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

Rejected alternatives:

- deterministic IDs for everything: attractive ergonomically, but fragile for dynamic construction, closures, ordering-dependent definitions, and backend-visible state
- explicit IDs for everything: simpler conceptually, but too much migration burden for top-level framework-owned actions and py_components where Dara can infer stable code identity
- random frontend-visible IDs backed by process-local registries: works only when every follow-up request lands on the same worker
- manifest support for runtime-created definitions: impossible to make reliable when the definition only exists on the worker that happened to execute the render/request path

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

### Long-Term Mode Policy

`off`, `warn`, and `enforce` should remain the long-term model, including across a future Dara v2.

The goal is not to make every Dara app stateless by default. The goal is to make statelessness a clear, enforceable higher bar that applications can opt into when they want stronger performance, failover, and horizontal-scaling guarantees.

This gives Dara three durable adoption tiers:

- `off`: lowest adoption floor; preserves local/in-process compatibility and supports sticky-session scaling at most
- `warn`: migration/audit tier; surfaces distributed-incompatible patterns without blocking the app
- `enforce`: high-performance/high-scale tier; rejects patterns that would prevent stateless or distributed-safe operation

This lets Dara evolve the framework without forcing every application through the strictest contract:

- introduce the distributed-safe contract behind `enforce`
- warn or error on deprecated APIs that are incompatible with that contract
- give applications a concrete migration target when they choose to pursue stateless scaling
- keep simple/local apps viable without requiring distributed-safe architecture

A future Dara v2 may still remove deprecated APIs and clean up old implementation paths, but it should not make `enforce` mandatory. Instead, Dara v2 should preserve the mode split and make the boundaries sharper: local compatibility belongs in `off`, migration diagnostics belong in `warn`, and stateless/distributed guarantees belong in `enforce`.

Some narrow notebook / kernel scenarios still need browser value reads or other in-process behavior. Those should remain supported through `off` rather than weakening `enforce`.

`off` should allow simpler in-process patterns such as:

- browser value reads through `get_current_value()`
- local-only `ServerVariable` / `MemoryBackend` usage
- local task execution
- process-local caches and registries
- runtime-created definitions where still supported by the non-distributed runtime

`off` should not claim general multi-worker or multi-box support. At most, it can scale through sticky-session routing where each user/session remains pinned to one worker and the deployment accepts weaker failover guarantees.

Rejected alternatives:

- make browser RPC and process-local APIs work in `enforce`: this weakens the contract and keeps single-process assumptions alive
- make `enforce` the default or only v2 runtime: this raises the adoption floor and blocks apps that do not need stateless scaling
- require all users to migrate before any scaling work ships: this delays useful adapter/backplane work unnecessarily
- remove local-only compatibility entirely: too disruptive for notebook/kernel-style workflows

## Open Questions

- What deprecated APIs should be removed in a future Dara v2 even if `off` / `warn` / `enforce` remain as runtime modes?
