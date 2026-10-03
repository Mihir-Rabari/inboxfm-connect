import { describe, expect, it } from 'vitest'
import { FlowActionType } from '../../../src/lib/flows/actions/action'
import { FlowTriggerType } from '../../../src/lib/flows/triggers/trigger'
import {
    GenericStepOutput,
    LoopStepOutput,
    RouterStepOutput,
    StepOutputStatus,
} from '../../../src/lib/flow-run/execution/step-output'

/**
 * Step output is the immutable builder every step handler threads through the
 * engine. Each setter returns a NEW instance (via a `...this` spread) instead of
 * mutating, so a handler that forgets to reassign silently loses its write, and a
 * shared reference captured mid-run can never be changed underneath another
 * consumer. That immutability is the contract worth pinning.
 */

describe('GenericStepOutput', () => {
    const base = () => new GenericStepOutput({
        type: FlowActionType.CODE,
        status: StepOutputStatus.RUNNING,
        input: { a: 1 },
    })

    it('keeps the constructor arguments on the instance', () => {
        const output = base()
        expect(output.type).toBe(FlowActionType.CODE)
        expect(output.status).toBe(StepOutputStatus.RUNNING)
        expect(output.input).toEqual({ a: 1 })
        expect(output.output).toBeUndefined()
        expect(output.errorMessage).toBeUndefined()
        expect(output.duration).toBeUndefined()
    })

    it('returns a NEW instance from setStatus rather than mutating', () => {
        const original = base()
        const next = original.setStatus(StepOutputStatus.FAILED)

        expect(next).not.toBe(original)
        expect(original.status).toBe(StepOutputStatus.RUNNING)
        expect(next.status).toBe(StepOutputStatus.FAILED)
    })

    it('preserves untouched fields across a setter', () => {
        const withOutput = base().setOutput({ ok: true }).setDuration(42)
        const next = withOutput.setStatus(StepOutputStatus.SUCCEEDED)

        expect(next.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(next.output).toEqual({ ok: true })
        expect(next.duration).toBe(42)
        expect(next.type).toBe(FlowActionType.CODE)
        expect(next.input).toEqual({ a: 1 })
    })

    it('does not mutate a captured reference when a derived output advances', () => {
        // The engine holds intermediate outputs while later steps run; if any
        // setter mutated in place, an already-emitted result would change shape.
        const captured = base().setStatus(StepOutputStatus.SUCCEEDED)
        const derived = captured.setErrorMessage('late failure')

        expect(captured.errorMessage).toBeUndefined()
        expect(derived.errorMessage).toBe('late failure')
        expect(captured.status).toBe(StepOutputStatus.SUCCEEDED)
    })

    it('chains setters without losing earlier writes', () => {
        const output = base()
            .setStatus(StepOutputStatus.FAILED)
            .setErrorMessage('boom')
            .setDuration(7)
            .setOutput({ partial: true })

        expect(output.status).toBe(StepOutputStatus.FAILED)
        expect(output.errorMessage).toBe('boom')
        expect(output.duration).toBe(7)
        expect(output.output).toEqual({ partial: true })
    })

    it('lets a later setter overwrite an earlier one', () => {
        const output = base().setStatus(StepOutputStatus.RUNNING).setStatus(StepOutputStatus.PAUSED)
        expect(output.status).toBe(StepOutputStatus.PAUSED)
    })

    it('carries a falsy output rather than dropping it', () => {
        expect(base().setOutput(undefined).output).toBeUndefined()
        expect(base().setOutput(0).output).toBe(0)
        expect(base().setOutput('').output).toBe('')
        expect(base().setOutput(null).output).toBeNull()
    })

    it('builds via create with the same invariants', () => {
        const output = GenericStepOutput.create({
            type: FlowTriggerType.PIECE,
            status: StepOutputStatus.SUCCEEDED,
            input: 'payload',
            output: [1, 2],
        })

        expect(output.type).toBe(FlowTriggerType.PIECE)
        expect(output.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(output.output).toEqual([1, 2])
    })

    it('exposes every StepOutputStatus member on a round trip', () => {
        for (const status of Object.values(StepOutputStatus)) {
            expect(base().setStatus(status).status).toBe(status)
        }
    })
})

describe('RouterStepOutput', () => {
    it('initialises as a succeeded router with no output', () => {
        const output = RouterStepOutput.init({ input: { branchIndex: 0 } })

        expect(output.type).toBe(FlowActionType.ROUTER)
        expect(output.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(output.input).toEqual({ branchIndex: 0 })
        expect(output.output).toBeUndefined()
    })

    // Documents real behaviour: the inherited setters hard-code the base class,
    // so a RouterStepOutput narrowed by setStatus comes back as a plain
    // GenericStepOutput carrying the same fields. Subclass-only members are
    // therefore not available after any inherited setter - RouterStepOutput adds
    // none today, but this pins the narrowing so adding one is a deliberate choice.
    it('narrows to the base class through an inherited setter, keeping every field', () => {
        const original = RouterStepOutput.init({ input: { branchIndex: 0 } })
        const narrowed = original.setStatus(StepOutputStatus.FAILED)

        expect(original).toBeInstanceOf(RouterStepOutput)
        expect(narrowed).toBeInstanceOf(GenericStepOutput)
        expect(narrowed).not.toBeInstanceOf(RouterStepOutput)

        expect(narrowed.status).toBe(StepOutputStatus.FAILED)
        expect(narrowed.type).toBe(FlowActionType.ROUTER)
        expect(narrowed.input).toEqual({ branchIndex: 0 })
    })
})

describe('LoopStepOutput', () => {
    it('defaults its output so item/index/iterations always exist', () => {
        const output = LoopStepOutput.init({ input: ['a', 'b'] })

        expect(output.type).toBe(FlowActionType.LOOP_ON_ITEMS)
        expect(output.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(output.output).toEqual({ item: undefined, index: 0, iterations: [] })
    })

    it('does not mutate the source when iterations are set', () => {
        const original = LoopStepOutput.init({ input: [] })
        const iterations = [{ 'step-1': original }]
        const next = original.setIterations(iterations)

        expect(next).not.toBe(original)
        expect(original.output?.iterations).toEqual([])
        expect(next.output?.iterations).toHaveLength(1)
    })

    it('preserves item and index when iterations are set', () => {
        const output = LoopStepOutput.init({ input: [] })
            .setItemAndIndex({ item: 'x', index: 3 })
            .setIterations([{ 'step-1': LoopStepOutput.init({ input: null }) }])

        expect(output.output?.item).toBe('x')
        expect(output.output?.index).toBe(3)
        expect(output.output?.iterations).toHaveLength(1)
    })

    it('preserves iterations when item and index are set', () => {
        const iterations = [{ 'step-1': LoopStepOutput.init({ input: null }) }]
        const output = LoopStepOutput.init({ input: [] })
            .setIterations(iterations)
            .setItemAndIndex({ item: 'y', index: 1 })

        expect(output.output?.item).toBe('y')
        expect(output.output?.index).toBe(1)
        expect(output.output?.iterations).toHaveLength(1)
    })

    it('reports hasIteration for recorded iterations only', () => {
        const output = LoopStepOutput.init({ input: [] })
            .setIterations([{ 'step-1': LoopStepOutput.init({ input: null }) }])

        expect(output.hasIteration(0)).toBe(true)
        expect(output.hasIteration(1)).toBe(false)
        expect(output.hasIteration(-1)).toBe(false)
    })

    it('hasIteration is false for an empty iteration list', () => {
        expect(LoopStepOutput.init({ input: [] }).hasIteration(0)).toBe(false)
    })

    it('accepts a falsy item without losing the iteration index', () => {
        const output = LoopStepOutput.init({ input: [] }).setItemAndIndex({ item: 0, index: 2 })

        expect(output.output?.item).toBe(0)
        expect(output.output?.index).toBe(2)
    })
})