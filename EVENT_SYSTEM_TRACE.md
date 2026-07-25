# Event System Runtime Trace

**Repository State:** main branch (commit 7341d518e3)  
**Analysis Date:** Based on current codebase state  
**Analysis Type:** Literal code trace (no inference)

---

## Executive Summary

**FINDING: NOT SAFE TO REMOVE**

The platform-webhooks and event-destinations system is **PARTIALLY ACTIVE** but **MOSTLY DORMANT** in the current codebase state.

- **Active Runtime Path:** ✅ EXISTS but **LIMITED**
- **Legacy Workflow Dependency:** ❌ FLOWS MODULE COMMENTED OUT
- **New Execute Runtime Dependency:** ❌ NO CONNECTION
- **Production Usage:** ⚠️ MINIMAL (only for CONNECTION and SIGNING_KEY events in EE/Cloud)

---

## 1. Event Emission Graph

### 1.1 Event Emitters by Module Status

#### COMMENTED OUT MODULES (DO NOT EMIT EVENTS AT RUNTIME)
```
❌ flowModule           → FLOW_CREATED, FLOW_UPDATED, FLOW_DELETED, FLOW_PUBLISHED, 
                          FLOW_ACTIVATED, FLOW_DEACTIVATED
❌ flowRunModule        → (indirectly triggers flow-run-side-effects)
❌ webhookModule        → (calls flowRunService.start)
❌ folderModule         → FOLDER_CREATED, FOLDER_UPDATED, FOLDER_DELETED
❌ variableModule       → VARIABLE_UPSERTED, VARIABLE_VALUE_REVEALED, VARIABLE_DELETED
```

**Evidence:**
```typescript
// packages/server/api/src/app/app.ts (lines 222-228)
// await app.register(collaborativeModule)
// await app.register(flowModule)              ❌ COMMENTED OUT
// await app.register(flowRunModule)           ❌ COMMENTED OUT
// await app.register(webhookModule)           ❌ COMMENTED OUT
await app.register(appConnectionModule)         ✅ ACTIVE
await app.register(platformAppConnectionModule)
// await app.register(variableModule)          ❌ COMMENTED OUT
```

#### ACTIVE MODULES (CURRENTLY EMIT EVENTS)
```
✅ appConnectionModule          → CONNECTION_UPSERTED, CONNECTION_DELETED
✅ signingKeyModule (EE/Cloud)  → SIGNING_KEY_CREATED
✅ projectRoleModule (EE/Cloud) → PROJECT_ROLE_CREATED, PROJECT_ROLE_UPDATED, 
                                  PROJECT_ROLE_DELETED
✅ projectReleaseModule (EE)    → PROJECT_RELEASE_CREATED
✅ projectReplaceModule (EE)    → PROJECT_REPLACED
✅ globalConnectionModule (EE)  → CONNECTION_UPSERTED, CONNECTION_DELETED
✅ authenticationModule         → USER_SIGNED_UP, USER_SIGNED_IN
✅ managedAuthnModule (EE)      → USER_SIGNED_UP, USER_SIGNED_IN
✅ authnSsoSamlModule (EE)      → USER_SIGNED_UP, USER_SIGNED_IN
✅ federatedAuthModule (EE)     → USER_SIGNED_UP, USER_SIGNED_IN
```

**Evidence:**
```typescript
// packages/server/api/src/app/app.ts (lines 226, 300-315, 332-347)
await app.register(appConnectionModule)           // Line 226 - ACTIVE
await app.register(signingKeyModule)              // Lines 300, 332 - EE/Cloud only
await app.register(projectRoleModule)             // Lines 313, 344 - EE/Cloud only
await app.register(projectReleaseModule)          // Lines 314, 345 - EE/Cloud only
await app.register(projectReplaceModule)          // Lines 315, 346 - EE/Cloud only
await app.register(globalConnectionModule)        // Lines 316, 347 - EE/Cloud only
```

### 1.2 FLOW_RUN Event Emitters

#### DORMANT (flowRunModule commented out)
```typescript
// packages/server/api/src/app/flows/flow-run/flow-run-side-effects.ts

flowRunSideEffects(log) = {
    onStart()  → FLOW_RUN_STARTED     ❌ NOT CALLED (flowRunService not registered)
    onFinish() → FLOW_RUN_FINISHED    ❌ NOT CALLED (flowRunService not registered)
    onResume() → FLOW_RUN_RESUMED     ❌ NOT CALLED (flowRunService not registered)
    onRetry()  → FLOW_RUN_RETRIED     ❌ NOT CALLED (flowRunService not registered)
}
```

**Call Chain (BROKEN):**
```
flowRunService.start()
    ↓
flowRunSideEffects.onStart({ flowRun, platformId })
    ↓
applicationEvents.sendWorkerEvent({
    projectId: flowRun.projectId,
    platformId,
    action: ApplicationEventName.FLOW_RUN_STARTED,
    data: { flowRun }
})
```

**Why Broken:**
- `flowRunService.start()` is called by:
  1. `webhook.service.ts` → but `webhookModule` is **COMMENTED OUT** (line 225)
  2. `flow.module.ts` (manual trigger) → but `flowModule` is **COMMENTED OUT** (line 223)
  3. Tests only

**Evidence:**
```typescript
// packages/server/api/src/app/app.ts (line 224)
// await app.register(webhookModule)    ❌ COMMENTED OUT
```

---

## 2. Subscriber Graph

### 2.1 Event Listener Registration

```typescript
// packages/server/api/src/app/ee/platform-webhooks/platform-webhooks.module.ts

export const platformWebhooksModule: FastifyPluginAsync = async (app) => {
    eventDestinationService(app.log).setup()    // ✅ REGISTERS LISTENERS
    await app.register(platformWebhooksController, { prefix: '/v1/event-destinations' })
}
```

**Listener Registration:**
```typescript
// packages/server/api/src/app/event-destinations/event-destinations.service.ts (line 32)

setup(): void {
    applicationEvents(log).registerListeners(log, {
        userEvent: () => async (event) => {        // ✅ SUBSCRIBES TO USER EVENTS
            await eventDestinationService(log).trigger({
                projectId: event.projectId,
                event,
            })
        },
        workerEvent: () => async (projectId, event) => {  // ✅ SUBSCRIBES TO WORKER EVENTS
            await eventDestinationService(log).trigger({
                projectId,
                event,
            })
        },
    })
}
```

**Trigger Logic:**
```typescript
// packages/server/api/src/app/event-destinations/event-destinations.service.ts (line 79)

trigger: async ({ projectId, event }: TriggerParams): Promise<void> => {
    const platformId = event.platformId
    
    // Find matching event destinations
    const conditions: FindOptionsWhere<EventDestinationSchema>[] = [{
        platformId,
        events: ArrayContains([event.action]),
        scope: EventDestinationScope.PLATFORM,
    }]
    
    // PROJECT scope only for FLOW_RUN_FINISHED
    const broadcastToProject = !isNil(projectId) && 
                               PROJECT_SCOPE_EVENTS.includes(event.action)
    if (broadcastToProject) {
        conditions.push({
            platformId,
            projectId,
            events: ArrayContains([event.action]),
            scope: EventDestinationScope.PROJECT,
        })
    }
    
    const destinations = await eventDestinationRepo().findBy(conditions)
    
    // Skip internal webhook loops
    const destinationsToDispatch = await skipInternalDestinationsOnFlowCycle({
        destinations,
        event,
        log,
    })
    
    // Queue webhook delivery jobs
    await Promise.all(destinationsToDispatch.map(destination =>
        jobQueue(log).add({    // ⚠️ NOTE: jobQueue is stubbed to empty function
            type: JobType.ONE_TIME,
            data: {
                schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                platformId,
                projectId,
                webhookId: destination.id,
                webhookUrl: destination.url,
                payload: event,
                jobType: WorkerJobType.EVENT_DESTINATION,
            },
        }),
    ))
}
```

**CRITICAL FINDING:**
```typescript
// packages/server/api/src/app/event-destinations/event-destinations.service.ts (line 11)

const jobQueue = (log: any) => ({ add: async (data: any) => {} })  // ⚠️ STUBBED!
```

**This means:**
- Event destinations ARE queried from the database
- Webhook delivery jobs are NOT actually queued
- The system goes through the motions but does nothing

---

## 3. Complete Call Stack

### 3.1 Active Path (CONNECTION_UPSERTED Example)

```
HTTP POST /v1/app-connections
    ↓
app-connection.controller.ts :: upsertAppConnection()
    ↓
appConnectionService.upsert(...)
    ↓
applicationEvents(request.log).sendUserEvent(request, {
    action: ApplicationEventName.CONNECTION_UPSERTED,
    data: { connection }
})
    ↓
helper/application-events.ts :: sendUserEvent()
    ↓
enrichAuditEventParam() → adds user, project, platform metadata
    ↓
for (const listener of listeners.userEventListeners) {
    listener(event)    // ← event-destinations listener called here
}
    ↓
event-destinations.service.ts :: trigger()
    ↓
eventDestinationRepo().findBy(conditions)    // ✅ DB QUERY EXECUTED
    ↓
skipInternalDestinationsOnFlowCycle()
    ↓
jobQueue(log).add(...)    // ❌ STUBBED - DOES NOTHING
```

### 3.2 Dormant Path (FLOW_RUN_FINISHED - Would Work If Enabled)

```
HTTP POST /v1/webhooks/{flowId}    ❌ WEBHOOK MODULE COMMENTED OUT
    ↓
webhook.service.ts :: handleWebhook()
    ↓
flowRunService(logger).start(...)
    ↓
flow-run-service.ts :: start()
    ↓
flowRunSideEffects(log).onStart({ flowRun, platformId })
    ↓
flow-run-side-effects.ts :: onStart()
    ↓
applicationEvents(log).sendWorkerEvent({
    projectId: flowRun.projectId,
    platformId,
    action: ApplicationEventName.FLOW_RUN_STARTED,
    data: { flowRun }
})
    ↓
helper/application-events.ts :: sendWorkerEvent()
    ↓
for (const listener of listeners.workerEventListeners) {
    listener(projectId, event)    // ← event-destinations listener would be called
}
    ↓
event-destinations.service.ts :: trigger()
    ↓
eventDestinationRepo().findBy(conditions)
    ↓
jobQueue(log).add(...)    // ❌ STUBBED - DOES NOTHING
```

---

## 4. Runtime Dependency Chains

### 4.1 Legacy Workflow Runtime (COMMENTED OUT)

```
webhookModule (COMMENTED OUT)
    ↓
webhook.service.ts
    ↓
flowRunService.start()
    ↓
flowRunSideEffects.onStart()
    ↓
FLOW_RUN_STARTED event
    ↓
event-destinations.trigger()
```

**Status:** ❌ BROKEN - webhookModule not registered

### 4.2 New Synchronous Execute Runtime (NO CONNECTION)

```
executeModule (ACTIVE)
    ↓
execute.controller.ts :: POST /v1/execute
    ↓
HeadlessRuntime.execute()
    ↓
@inboxfm-connect/runtime
    ↓
❌ NO applicationEvents calls
❌ NO flowRunService calls
❌ NO FLOW_RUN events emitted
```

**Evidence:**
```typescript
// packages/server/api/src/app/execute/execute.controller.ts

export const executeController: FastifyPluginAsyncZod = async (fastify) => {
    fastify.post('/', ExecuteRequestOptions, async (request) => {
        const publicUrl = await system.get(AppSystemProp.FRONTEND_URL) || 'http://localhost:3000'
        return runtime.execute({    // ← Synchronous execution, no events
            integration: request.body.integration,
            tool: request.body.tool,
            connectionId: request.body.connectionId,
            input: request.body.input,
            projectId: request.projectId,
            platformId: request.principal.platform.id,
            internalApiUrl: publicUrl,
            publicApiUrl: publicUrl,
        })
    })
}
```

**Grep verification:**
```bash
grep -r "flowRunService|applicationEvents|FLOW_RUN" packages/runtime/**/*.ts
# Result: No matches found
```

---

## 5. API Endpoints Analysis

### 5.1 Platform Webhooks API (ACTIVE)

```
GET    /v1/event-destinations         → List event destinations
POST   /v1/event-destinations         → Create event destination
PATCH  /v1/event-destinations/:id     → Update event destination
DELETE /v1/event-destinations/:id     → Delete event destination
POST   /v1/event-destinations/test    → Test event destination
```

**Security:** Platform admin only (EE/Cloud editions)

**Evidence:**
```typescript
// packages/server/api/src/app/ee/platform-webhooks/platform-webhooks.controller.ts

export const platformWebhooksController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreateEventDestinationRequest, async (req) => {
        return eventDestinationService(req.log).create(req.body, req.principal.platform.id)
    })
    // ... other endpoints
}
```

### 5.2 Event Emission Endpoints (PARTIALLY ACTIVE)

#### ACTIVE (emit events that event-destinations can capture):
```
POST   /v1/app-connections                    → CONNECTION_UPSERTED
DELETE /v1/app-connections/:id                → CONNECTION_DELETED
POST   /v1/signing-keys (EE/Cloud)            → SIGNING_KEY_CREATED
POST   /v1/project-roles (EE/Cloud)           → PROJECT_ROLE_CREATED
PATCH  /v1/project-roles/:id (EE/Cloud)       → PROJECT_ROLE_UPDATED
DELETE /v1/project-roles/:id (EE/Cloud)       → PROJECT_ROLE_DELETED
POST   /v1/project-releases (EE/Cloud)        → PROJECT_RELEASE_CREATED
POST   /v1/project-replace (EE/Cloud)         → PROJECT_REPLACED
POST   /v1/authentication/sign-up             → USER_SIGNED_UP
POST   /v1/authentication/sign-in             → USER_SIGNED_IN
```

#### COMMENTED OUT (would emit events but endpoints don't exist):
```
POST   /v1/flows               → FLOW_CREATED
PATCH  /v1/flows/:id           → FLOW_UPDATED, FLOW_PUBLISHED, FLOW_ACTIVATED, FLOW_DEACTIVATED
DELETE /v1/flows/:id           → FLOW_DELETED
POST   /v1/webhooks/:flowId    → (triggers FLOW_RUN_STARTED)
POST   /v1/folders             → FOLDER_CREATED
PATCH  /v1/folders/:id         → FOLDER_UPDATED
DELETE /v1/folders/:id         → FOLDER_DELETED
POST   /v1/variables           → VARIABLE_UPSERTED
DELETE /v1/variables/:id       → VARIABLE_DELETED
```

---

## 6. What Breaks If Removed Today?

### 6.1 Direct Breakage

**API Endpoints Lost:**
- `GET /v1/event-destinations` - platform admins can no longer list webhooks
- `POST /v1/event-destinations` - platform admins can no longer register webhooks
- `PATCH /v1/event-destinations/:id` - cannot update webhooks
- `DELETE /v1/event-destinations/:id` - cannot remove webhooks
- `POST /v1/event-destinations/test` - cannot test webhook delivery

**Database Table Lost:**
- `event_destination` table would become orphaned
- Migration rollback would be needed

### 6.2 Runtime Impact

**Current State (jobQueue stubbed):**
```
✅ Event destinations CAN be created via API
✅ Event destinations ARE stored in database
✅ Events ARE emitted by active modules
✅ Event destinations ARE queried on event emission
❌ Webhook delivery jobs are NOT queued (stubbed)
❌ No actual HTTP POSTs are sent to destination URLs
```

**If Removed:**
```
❌ Platform admins lose webhook management UI
❌ Database queries for event destinations fail
❌ Event emission still works (other listeners unaffected)
✅ No runtime errors in execute module (it doesn't use events)
⚠️ Connection/signing-key events still emitted but ignored
```

### 6.3 User-Facing Impact

**Current Users:**
- Enterprise/Cloud platform administrators who configured event destinations
- External systems expecting webhook notifications from Activepieces
- Monitoring/logging systems watching for CONNECTION_UPSERTED, USER_SIGNED_UP, etc.

**Impact Severity:**
- **Low** - Most events (FLOW_RUN_*) are already dormant (webhookModule commented out)
- **Medium** - Active events (CONNECTION_UPSERTED, SIGNING_KEY_CREATED) are captured but not delivered
- **High** - If any production platform has event destinations configured, removal breaks their integration

---

## 7. Evidence Summary

### 7.1 platformWebhooksModule Registration

**File:** `packages/server/api/src/app/app.ts`

```typescript
// Line 53
import { platformWebhooksModule } from './ee/platform-webhooks/platform-webhooks.module'

// Lines 311, 343 (CLOUD edition)
await app.register(platformWebhooksModule)

// Lines 343 (ENTERPRISE edition)
await app.register(platformWebhooksModule)
```

### 7.2 EventDestinationEntity Registration

**File:** `packages/server/api/src/app/database/database-connection.ts`

```typescript
// Line 29
import { EventDestinationEntity } from '../event-destinations/event-destinations.entity'

// Line 129
const entities = [
    // ... other entities
    EventDestinationEntity,    // ✅ REGISTERED IN DATABASE
]
```

### 7.3 Event Listener Setup

**File:** `packages/server/api/src/app/ee/platform-webhooks/platform-webhooks.module.ts`

```typescript
export const platformWebhooksModule: FastifyPluginAsync = async (app) => {
    eventDestinationService(app.log).setup()    // ✅ CALLED ON MODULE LOAD
    await app.register(platformWebhooksController, { prefix: '/v1/event-destinations' })
}
```

### 7.4 jobQueue Stub

**File:** `packages/server/api/src/app/event-destinations/event-destinations.service.ts`

```typescript
// Line 11 - CRITICAL EVIDENCE
const jobQueue = (log: any) => ({ add: async (data: any) => {} })
const JobType = { CHAT: 'CHAT', ONE_TIME: 'ONE_TIME', EVENT_DESTINATION: 'EVENT_DESTINATION' } as const
```

**This stub was likely added during the migration to disable webhook delivery without removing the infrastructure.**

---

## 8. Recommendation

### NOT SAFE TO REMOVE (with conditions)

**Reasoning:**

1. **Active API Surface:** 5 REST endpoints exist and are accessible to platform admins
2. **Active Database Entity:** EventDestinationEntity is registered and migrations exist
3. **Active Event Capture:** Events ARE being emitted by 10+ active modules
4. **Partial Functionality:** System queries destinations but doesn't deliver (stubbed)
5. **Unknown Production Usage:** Cannot confirm if any production platforms have event destinations configured

### Safe Removal Path

If removal is desired, follow this sequence:

1. **Audit Production Data:**
   ```sql
   SELECT COUNT(*) FROM event_destination;
   ```
   - If > 0: Notify affected platforms, provide migration timeline

2. **Add Deprecation Warning:**
   - Return HTTP 410 (Gone) from all `/v1/event-destinations` endpoints
   - Log warning when eventDestinationService.setup() is called
   - Give 60-90 day notice

3. **Remove in Order:**
   - Week 1: Comment out `platformWebhooksModule` registration
   - Week 2: Remove `platformWebhooksController` and `platformWebhooksModule`
   - Week 3: Remove `eventDestinationService.setup()` call
   - Week 4: Remove `event-destinations` folder
   - Week 5: Remove `EventDestinationEntity` from database registration
   - Week 6: Create migration to drop `event_destination` table

4. **Update DEAD_CODE.md:**
   - Current entry is **INCORRECT** - system is not fully dead
   - Change to: "Partially active but webhook delivery is stubbed. Removal requires deprecation process."

### Alternative: Re-enable Full Functionality

The infrastructure is 90% complete. To make it fully functional:

1. **Un-stub jobQueue:**
   ```typescript
   // Replace line 11 in event-destinations.service.ts
   import { jobQueue } from '../workers/job-queue/job-queue'
   ```

2. **Ensure worker module can process EVENT_DESTINATION jobs:**
   - Check if WorkerJobType.EVENT_DESTINATION has a handler
   - Implement HTTP POST to destination.url with event payload

3. **Re-enable commented modules (optional):**
   - If workflow functionality returns, FLOW_RUN_* events will flow automatically

---

## 9. Key Files Reference

```
packages/server/api/src/app/
├── app.ts                                          # Module registration
├── event-destinations/
│   ├── event-destinations.entity.ts               # Database schema
│   └── event-destinations.service.ts              # Event subscription + trigger logic
├── ee/platform-webhooks/
│   ├── platform-webhooks.module.ts                # Module setup
│   └── platform-webhooks.controller.ts            # REST API endpoints
├── flows/flow-run/
│   └── flow-run-side-effects.ts                   # FLOW_RUN_* event emitters (dormant)
├── app-connection/
│   └── app-connection.controller.ts               # CONNECTION_* event emitters (active)
├── helper/
│   └── application-events.ts                       # Event bus implementation
└── database/
    └── database-connection.ts                      # Entity registration

packages/runtime/
└── src/                                            # ❌ No event system integration
```

---

## 10. Conclusion

**The platform-webhooks and event-destinations system is a "zombie feature":**
- Infrastructure: ✅ Complete and wired
- API: ✅ Functional
- Event capture: ✅ Working
- Webhook delivery: ❌ Stubbed (intentionally disabled)
- Primary use case (FLOW_RUN events): ❌ Source modules commented out

**It's NOT dead code, but it's NOT fully alive either.**

Removal requires careful deprecation process due to active API surface and unknown production usage.
