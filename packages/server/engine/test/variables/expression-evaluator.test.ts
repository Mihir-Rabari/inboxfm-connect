import { expressionEvaluator } from '../../src/lib/variables/expression-evaluator'

describe('ExpressionEvaluator Security & Functionality Boundary', () => {
    it('evaluates basic mathematical and string expressions', async () => {
        const result = await expressionEvaluator.evaluate({
            script: '2 + 3 * 4',
            scriptContext: {},
        })
        expect(result).toBe(14)
    })

    it('evaluates expressions against provided scriptContext', async () => {
        const result = await expressionEvaluator.evaluate({
            script: 'user.name.toUpperCase() + " (" + user.age + ")"',
            scriptContext: {
                user: {
                    name: 'alice',
                    age: 30,
                },
            },
        })
        expect(result).toBe('ALICE (30)')
    })

    it('supports custom helper functions passed in options', async () => {
        const result = await expressionEvaluator.evaluate({
            script: 'double(value)',
            scriptContext: { value: 21 },
            functions: {
                double: (n: unknown) => (n as number) * 2,
            },
        })
        expect(result).toBe(42)
    })

    it('blocks access to process.env in sandboxed modes', async () => {
        const result = await expressionEvaluator.evaluate({
            script: 'typeof process !== "undefined" && process.env ? process.env.SECRET_TOKEN : undefined',
            scriptContext: {},
        })
        expect(result).toBeFalsy()
    })

    it('blocks require (security sandbox check)', async () => {
        const result = await expressionEvaluator.evaluate({
            script: 'typeof require !== "undefined" ? require("fs") : "blocked"',
            scriptContext: {},
        })
        expect(result).not.toHaveProperty('readFileSync')
    })
})
