import { BaseStepOutput, StepOutputStatus } from '@inboxfm-connect/shared'

export class ExecutionContext {
    public steps: Record<string, BaseStepOutput> = {}

    public static empty(): ExecutionContext {
        return new ExecutionContext()
    }

    public get outputs(): Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(this.steps).map(([key, value]) => {
                const error = value.status === StepOutputStatus.FAILED && value.errorMessage !== undefined
                    ? { message: value.errorMessage }
                    : undefined
                return [
                    key,
                    {
                        output: value.output,
                        error,
                    },
                ]
            })
        )
    }

    public async upsertStep(stepName: string, stepOutput: BaseStepOutput): Promise<ExecutionContext> {
        this.steps[stepName] = stepOutput
        return this
    }
}
