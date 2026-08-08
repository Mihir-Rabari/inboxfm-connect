# MCP_ARCHITECTURE

**Companion to `ADR-001_HEADLESS_RUNTIME.md` — Decision 10.**
MCP as a permanent strategic subsystem, with no dependency on workflows.
Design document. No code changed.

---

## 1. Position

MCP is the only interface in the repository that is *natively* AI-native. Everything else — REST
endpoints, the removed builder, the flow APIs — was designed for a human or a program that already
knows what it wants. MCP is designed for a model that must **discover** what is possible, **inspect**
what a capability requires, and **invoke** it.

That is exactly the product. **MCP should be the primary public surface of InboxFM Connect**, not one
integration among many.

---

## 2. Current state

`mcpServerModule` and `mcpOAuthApproveController` are commented out at `app.ts:208-209`. The subtree
is substantial and in mixed condition:

| Area | Files | Workflow coupling |
|---|---|---|
| OAuth2 authorization server | `mcp/oauth/**` — 13 files, 3 entities | **None** |
| Server construction | `mcp-server-builder.ts` | **High** — `registerFlowTools`, flow-centric instructions |
| Service | `mcp-service.ts` | **Medium** — `listMcpFlows()` returns `PopulatedFlow[]` (line 99) |
| Permissions / project selection | `mcp-permissions.ts`, `mcp-project-selection.ts` | None |
| Tools | `mcp/tools/**` — 25 files | Mixed — see §4 |

Three concrete problems:

1. **`MCP_SERVER_INSTRUCTIONS` advertises a product that no longer exists.** It documents a 5-step
   workflow — `ap_build_flow`, `ap_create_flow`, `ap_update_trigger`, `ap_add_step`,
   `ap_validate_flow`, `ap_lock_and_publish` — plus a step-reference template language
   (`{{step_1['output'].id}}`). Every word of it describes a builder that was deleted.
2. **`PopulatedMcpServer.flows` is the tool source.** `registerFlowTools` materializes MCP tools from
   a flow list. With no flows, the server exposes nothing but static tools.
3. **Branding is hardcoded.** `name: 'Activepieces'`, `websiteUrl: 'https://activepieces.com'`,
   `cdn.activepieces.com` icons, and "Automation and workflow MCP server by Activepieces" — a direct
   violation of the white-labeling rule, on a customer-facing surface.

---

## 3. Target: five families, zero workflow dependency

```
┌──────────────────────────────────────────────────────────────────────┐
│  MCP SERVER                                                          │
│                                                                      │
│  AUTHENTICATION   OAuth2 AS: dynamic client registration, PKCE,      │
│                   authorize, token, revoke, metadata discovery       │
│                   → mcp/oauth/**            KEEP UNCHANGED           │
│                                                                      │
│  CONNECTIONS      list authenticated integrations, status, scopes    │
│                   → ap_list_connections                              │
│                                                                      │
│  TOOLS            materialized from CONNECTED integrations           │
│                   via semantic tool search                           │
│                   → registerIntegrationTools  (replaces flow tools)  │
│                                                                      │
│  CAPABILITIES     dynamic property resolution — dependent dropdowns, │
│                   option chains, schema inspection                   │
│                   → ap_get_piece_props, ap_resolve_property_options, │
│                     ap_resolve_property_chain                        │
│                                                                      │
│  EXECUTION        invoke a tool; read an execution; stream events    │
│                   → ap_run_action → POST /v1/execute                 │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Authentication — keep untouched

`mcp/oauth/` is a complete, spec-conformant MCP authorization server: dynamic client registration
(`mcp-oauth-register.controller.ts`), PKCE (`mcp-oauth.pkce.ts`), authorization code
(`mcp-oauth-authorize.controller.ts`, `mcp-oauth-code.service.ts`), token issue and revoke, and
metadata discovery (`mcp-oauth-metadata.controller.ts`). Three entities, all registered in
`getEntities()`. **Zero workflow coupling.**

This is high-value, standards-conformant, and hard to rebuild. No cleanup pass should touch it. It is
what lets an external agent authenticate to InboxFM Connect without a shared secret — the front door
of the product.

### 3.2 Connections

The one family that needs almost no change. `ap_list_connections` already returns authenticated
integrations with `externalId`, which is the handle every other family keys on.

Addition: expose connections as MCP **resources** (`mcp://connections/{id}`) alongside the tool, so a
client can browse rather than call. Resources are the natural fit for enumerable state.

### 3.3 Tools — the substantive change

Replace `registerFlowTools({ server, mcp, projectId, … })` with `registerIntegrationTools`, sourced
from the catalog rather than from flows:

```
project's connections  ──▶ connected integrations
                              │
                              ▼
                       toolSearchService (semantic index over actions)
                              │
                              ▼
                    top-k tool definitions + parameter schemas
                              │
                              ▼
                       server.registerTool(...)  per tool
```

**Why retrieval-backed and not a full listing.** 400+ integrations at roughly 20 tools each is on the
order of 8,000 definitions. MCP clients receive the tool list in-context; exhaustive listing is
impossible and degrades selection accuracy long before it hits a hard limit. Scoping to *connected*
integrations cuts this by orders of magnitude and is also a security property — a client cannot see,
let alone invoke, a tool for an integration the project never authenticated.

Two-tier exposure:

| Tier | Contents | Rationale |
|---|---|---|
| **Static** | `ap_search_actions`, `ap_search_triggers`, `ap_list_connections`, `ap_get_piece_props`, `ap_run_action` | Always present; the discovery entry points |
| **Materialized** | Top-k tools for the project's connected integrations | Direct invocation without a search hop for the common case |

An external agent that needs something outside the materialized set calls `ap_search_actions` and
then `ap_run_action`. The static tier guarantees the full catalog stays reachable.

### 3.4 Capabilities — keep, and recognise what it is

`ap_get_piece_props`, `ap_resolve_property_options`, and `ap_resolve_property_chain` run
`EXECUTE_PROPERTY` through `userInteractionWatcher` (`ap-get-piece-props.ts:160`,
`ap-resolve-property-chain.ts:67`, `mcp-utils.ts:613`).

This is the mechanism that lets a language model fill a **dependent dropdown** — pick a Slack
workspace, then list *that workspace's* channels. Without it a model can only guess opaque IDs. It is
one of the most valuable and least appreciated things in the repository, and it is what makes 400+
integrations usable by an LLM rather than merely reachable.

It is also the consumer that keeps `ExecutePropsOptions.sampleData` alive — renamed to `resolvedInput`
per `EXECUTION_MODEL.md` §6, since it is the resolved input context, not sample data.

### 3.5 Execution

| Tool | Maps to |
|---|---|
| `ap_run_action` | `POST /v1/execute` → `HeadlessRuntime.execute` |
| `ap_get_execution` *(new)* | Execution record + its `ToolCall` rows |
| `ap_run_prompt` *(new)* | `POST /v1/prompt` — the planner loop, for agent-to-agent delegation |

`ap_run_action` must route through the *same* path as the HTTP surface, producing an `Execution` and
its events. A parallel execution path is how `engine-run-api.ts` became dead without anyone noticing.

---

## 4. Tool-by-tool disposition

| Tool | Verdict | Reason |
|---|---|---|
| `ap-list-connections` | **KEEP** | Connections family |
| `ap-research-pieces` | **KEEP** | Catalog discovery; keyword floor for tool search |
| `ap-search-actions`, `ap-search-triggers` | **KEEP, promote** | Semantic tool search — the discovery entry point |
| `ap-get-piece-props` | **KEEP** | Capabilities |
| `ap-resolve-property-options`, `ap-resolve-property-chain` | **KEEP** | Capabilities — dependent dropdowns |
| `ap-run-action` | **KEEP, rewire** | Execution; must produce an `Execution` record |
| `ap-list-ai-models` | **KEEP** | Planner/provider introspection |
| `ap-set-project-context` | **KEEP** | Platform-level project selection |
| `ap-validate-step-config` | **REPLACE** | Real capability (validate before invoking) but named for steps and imports `SourceCode`. Becomes the `dryRun` verb (`EXECUTION_MODEL.md` §6) |
| `ap-setup-guide` | **REWRITE** | Content describes flow building |
| `flow-run-utils.ts` | **DELETE** | Flow run formatting |
| `piece-expertise.ts` | **REVIEW** | Prompt content likely flow-centric; the mechanism may be reusable |
| 8 table tools (`ap-create-table`, `ap-find-records`, `ap-insert-records`, `ap-update-record`, `ap-delete-records`, `ap-list-tables`, `ap-delete-table`, `ap-manage-fields`) | **OUT OF SCOPE** | `tablesModule` is commented out (`app.ts:219`) but the entities remain registered. Whether Tables is a product is a separate decision, not a runtime one |

Also delete from `mcp-service.ts` / `mcp-server-builder.ts`: `listMcpFlows()`,
`PopulatedMcpServer.flows`, `registerFlowTools`, and the entire `MCP_SERVER_INSTRUCTIONS` block —
rewritten around discover → inspect → invoke.

**Replacement instructions, in outline:**

```
1. Discover:  ap_list_connections  →  ap_search_actions
2. Inspect:   ap_get_piece_props   →  ap_resolve_property_options   (dependent fields)
3. Invoke:    ap_run_action        (or ap_run_prompt to delegate to the planner)

- Auth: every invocation needs a connection externalId from ap_list_connections.
- Never guess an option value; resolve it. IDs are opaque.
- ap_run_action returns an executionId; failures carry a structured error.
```

Note what disappears: the step-reference template language (`{{step_1['output'].id}}`). There are no
steps to reference. A model composes by passing one tool's *result* as another tool's *argument* —
ordinary function composition, which models do natively and which needs no template syntax at all.

---

## 5. Bidirectionality — and why the internal planner does not use MCP

InboxFM Connect is on both sides of the protocol:

| Role | Meaning |
|---|---|
| **MCP server** | External agents (Claude, IDEs, other platforms) reach 400+ authenticated integrations |
| **MCP client** | The internal planner could consume third-party MCP servers as additional tools |

**Recommendation: the internal planner calls the engine directly, not through the platform's own MCP
server.**

| | Via own MCP | Direct |
|---|---|---|
| Hops | planner → MCP → HTTP → runtime → engine | planner → runtime → engine |
| Latency | extra serialization on the path the user waits on | minimal |
| Typing | JSON-schema round trip | typed in-process |
| Errors | flattened to MCP error shape | full `ExecutionError` taxonomy (16 of 18 types live) |

Both surfaces are driven by the **same tool registry** — `pieceMetadataService` + `toolSearchService` —
so there is exactly one definition of what a tool is and no drift between what an external agent sees
and what the internal planner sees. That shared registry, not a shared transport, is what keeps them
consistent.

Consuming *third-party* MCP servers as planner tools is a genuine future capability (it makes the
platform extensible without writing an integration) and is orthogonal to the above. Out of scope here.

---

## 6. Connections, tools, capabilities, authentication — without workflows

Restating the audit's question directly, since it is the crux:

| Concern | Old answer | New answer |
|---|---|---|
| **Connections** | Referenced by a flow step's `auth` setting | First-class. `connectionId` is a parameter of `ToolInvocation`; the connection *is* the unit of authorization |
| **Tools** | A flow was published as an MCP tool | Materialized from connected integrations via semantic search. An integration action *is* a tool — no wrapper |
| **Capabilities** | Property resolution needed `flowVersion` context | `EXECUTE_PROPERTY` with `resolvedInput`; `flowVersion?` is optional today and dropped |
| **Authentication** | MCP token, plus OAuth for external clients | Unchanged — `mcp/oauth/**` never depended on workflows |
| **Execution** | MCP tool → trigger a flow run | MCP tool → `Execution` + `ToolCall`, same path as HTTP |

The through-line: **every one of these was already a connection/integration concern that had been
routed through a flow.** Removing the flow does not remove the concern; it removes an indirection.

---

## 7. Migration

| Step | Action | Depends on |
|---|---|---|
| 1 | Delete `listMcpFlows`, `registerFlowTools`, `PopulatedMcpServer.flows` | — |
| 2 | Delete flow-authoring tools + `flow-run-utils.ts`; rewrite `MCP_SERVER_INSTRUCTIONS` | 1 |
| 3 | White-label server metadata — name, description, icons, `websiteUrl` from platform appearance | — |
| 4 | Implement `registerIntegrationTools` from connections + tool search | tool search re-enabled |
| 5 | Rewire `ap_run_action` to produce an `Execution` | `EXECUTION_MODEL.md` |
| 6 | Re-enable `mcpServerModule` + `mcpOAuthApproveController` at `app.ts:208-209` | 1–5 |
| 7 | Add `ap_get_execution`, `ap_run_prompt` | planner |

Step 3 is not cosmetic. This is a customer-facing surface — an external agent's user sees the server
name and description — and `white-labeling` requires platform appearance, never hardcoded branding.
Step 6 is the gate: the module stays disabled until the workflow vocabulary is gone, because
re-enabling it early would expose tools for a builder that does not exist.

---

## 8. Why this is permanent

MCP is not a feature that could be deprecated in a later cleanup:

1. **It is the distribution channel.** The product's value is 400+ authenticated integrations. MCP is
   how any agent — not only InboxFM's own planner — reaches them.
2. **It is the extensibility contract.** New capabilities appear as tools with no API redesign.
3. **It is the only industry-standard interface here.** REST endpoints are bespoke; MCP is a protocol
   other vendors implement, which is what makes the integration library portable value rather than
   platform-locked value.
4. **It already carries the hardest part** — a conformant OAuth2 authorization server, complete and
   uncoupled.

The strategic risk is not that MCP gets deleted. It is that the workflow vocabulary is left in place
long enough that the surface calcifies around it — instructions that describe flows, tools that build
flows, and a tool list sourced from a flow table. That is why §7 steps 1–3 should land before
anything is re-enabled.
