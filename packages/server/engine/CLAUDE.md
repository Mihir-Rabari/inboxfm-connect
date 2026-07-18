# Engine

## Error Handling

- **Always throw `ExecutionError` subclasses** (from `@inboxfm-connect/shared`) instead of plain `Error`. The engine uses `tryCatchAndThrowOnEngineError` which only propagates errors of type `ExecutionErrorType.ENGINE` — plain `Error` instances are silently swallowed and treated as user-level failures.
- Use `EngineGenericError` for engine-level failures (e.g., failed API calls to the server).
- Use the existing specific error classes (`ConnectionNotFoundError`, `StorageLimitError`, etc.) when applicable.

## Input Resolution

- A USER-level `ExecutionError` (e.g. `ConnectionNotFoundError` from a stale `{{connections.X}}` reference) must surface as a user-level failure, never `INTERNAL_ERROR`. `INTERNAL_ERROR` fails the worker job and pages oncall — reserve it for genuine engine bugs.
- **Actions/Tools**: resolve input (`getPropsResolver().resolve(...)`) using `ExecutionContext` to map resolved parameters.
