import { initCodeSandbox } from '../core/code/code-sandbox'
import { utils } from '../utils'

export type ExpressionEvaluateOptions = {
    script: string
    scriptContext: Record<string, unknown>
    functions?: Record<string, (...args: unknown[]) => unknown>
}

/**
 * ExpressionEvaluator is the strict security boundary for resolving property expressions
 * (e.g. `{{ trigger.output.name + '!' }}` or `flattenNestedKeys(...)`).
 *
 * It ONLY evaluates expressions against a provided context.
 * It DOES NOT execute arbitrary user files, compile TS/JS steps, or access network/FS/process globals.
 */
export const expressionEvaluator = {
    async evaluate(options: ExpressionEvaluateOptions): Promise<unknown> {
        const { script, scriptContext, functions = {} } = options

        const { data: result, error: resultError } = await utils.tryCatchAndThrowOnEngineError(async () => {
            const codeSandbox = await initCodeSandbox()
            const evalResult = await codeSandbox.runScript({
                script,
                scriptContext,
                functions,
            })
            return evalResult ?? ''
        })

        if (resultError) {
            console.warn('[ExpressionEvaluator] Error evaluating expression script:', resultError)
            return ''
        }

        return result ?? ''
    },
}
