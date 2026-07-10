import { RuntimeOperation, RuntimeOperationType, RuntimeResponse, RuntimeStderr, RuntimeStdout } from './engine-operation'

export type RuntimeContract = {
    executeOperation(input: { operationType: RuntimeOperationType, operation: RuntimeOperation }): Promise<RuntimeResponse<unknown>>
}

export type WorkerNotifyContract = {
    stdout(input: RuntimeStdout): void
    stderr(input: RuntimeStderr): void
}

export type EngineContract = RuntimeContract

