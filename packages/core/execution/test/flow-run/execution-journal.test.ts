import { describe, expect, it } from 'vitest'
import { FlowActionType } from '../../src/lib/flows/actions/action'
import { executionJournal } from '../../src/lib/flow-run/execution/execution-journal'
import { GenericStepOutput, LoopStepOutput, StepOutput, StepOutputStatus } from '../../src/lib/flow-run/execution/step-output'

describe('executionJournal', () => {
    describe('upsertStep', () => {
        it('inserts a step at root level when path is empty', () => {
            const steps: Record<string, StepOutput> = {}
            const stepOutput = GenericStepOutput.create({
                input: { foo: 'bar' },
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
                output: { result: 123 },
            })

            const result = executionJournal.upsertStep({
                stepName: 'step_1',
                stepOutput,
                path: [],
                steps,
            })

            expect(result).toBe(steps)
            expect(steps['step_1']).toBe(stepOutput)
        })

        it('updates an existing step at root level', () => {
            const initialOutput = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.RUNNING,
            })
            const steps: Record<string, StepOutput> = {
                step_1: initialOutput,
            }
            const updatedOutput = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
                output: 'done',
            })

            executionJournal.upsertStep({
                stepName: 'step_1',
                stepOutput: updatedOutput,
                path: [],
                steps,
            })

            expect(steps['step_1']).toBe(updatedOutput)
            expect(steps['step_1'].status).toBe(StepOutputStatus.SUCCEEDED)
        })

        it('inserts step into existing loop iteration when path is provided', () => {
            const loopStep = LoopStepOutput.init({ input: null }).addIteration()
            const steps: Record<string, StepOutput> = {
                loop_1: loopStep,
            }
            const innerStep = GenericStepOutput.create({
                input: {},
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
                output: 'inner',
            })

            executionJournal.upsertStep({
                stepName: 'inner_step',
                stepOutput: innerStep,
                path: [['loop_1', 0]],
                steps,
            })

            const loopOutput = steps['loop_1']
            if (loopOutput.type === FlowActionType.LOOP_ON_ITEMS && loopOutput.output) {
                expect(loopOutput.output.iterations[0]['inner_step']).toBe(innerStep)
            }
            else {
                expect.unreachable('Expected loop_1 to be a loop on items step with output')
            }
        })

        it('throws error when path does not exist and createLoopIterationIfNotExists is false', () => {
            const steps: Record<string, StepOutput> = {}
            const stepOutput = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
            })

            expect(() => {
                executionJournal.upsertStep({
                    stepName: 'inner_step',
                    stepOutput,
                    path: [['missing_loop', 0]],
                    steps,
                    createLoopIterationIfNotExists: false,
                })
            }).toThrowError('Step missing_loop not found in path')
        })

        it('creates loop step and iteration when createLoopIterationIfNotExists is true', () => {
            const steps: Record<string, StepOutput> = {}
            const stepOutput = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
                output: { value: 42 },
            })

            executionJournal.upsertStep({
                stepName: 'inner_step',
                stepOutput,
                path: [['auto_loop', 0]],
                steps,
                createLoopIterationIfNotExists: true,
            })

            const createdLoop = steps['auto_loop']
            expect(createdLoop).toBeDefined()
            expect(createdLoop.type).toBe(FlowActionType.LOOP_ON_ITEMS)
            if (createdLoop.type === FlowActionType.LOOP_ON_ITEMS && createdLoop.output) {
                expect(createdLoop.output.iterations.length).toBe(1)
                expect(createdLoop.output.iterations[0]['inner_step']).toBe(stepOutput)
            }
            else {
                expect.unreachable('Expected auto_loop to be a loop on items step with output')
            }
        })
    })

    describe('getStep', () => {
        it('retrieves step at root level', () => {
            const stepOutput = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
            })
            const steps: Record<string, StepOutput> = {
                step_1: stepOutput,
            }

            const retrieved = executionJournal.getStep({
                stepName: 'step_1',
                path: [],
                steps,
            })

            expect(retrieved).toBe(stepOutput)
        })

        it('returns undefined if step does not exist at root path', () => {
            const steps: Record<string, StepOutput> = {}
            const retrieved = executionJournal.getStep({
                stepName: 'non_existent',
                path: [],
                steps,
            })
            expect(retrieved).toBeUndefined()
        })

        it('retrieves step inside nested loop iteration', () => {
            const nestedStep = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
                output: 'nested_val',
            })
            let loop = LoopStepOutput.init({ input: null }).addIteration()
            if (loop.output) {
                loop.output.iterations[0]['nested_step'] = nestedStep
            }
            const steps: Record<string, StepOutput> = {
                my_loop: loop,
            }

            const retrieved = executionJournal.getStep({
                stepName: 'nested_step',
                path: [['my_loop', 0]],
                steps,
            })

            expect(retrieved).toBe(nestedStep)
        })

        it('throws if step along the path is missing', () => {
            const steps: Record<string, StepOutput> = {}
            expect(() => {
                executionJournal.getStep({
                    stepName: 'step_1',
                    path: [['unknown_loop', 0]],
                    steps,
                })
            }).toThrowError('Step unknown_loop not found in path')
        })
    })

    describe('getStateAtPath', () => {
        it('returns steps dictionary when path is empty', () => {
            const steps: Record<string, StepOutput> = {
                step_1: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
            }
            const state = executionJournal.getStateAtPath({ path: [], steps })
            expect(state).toBe(steps)
        })

        it('returns target iteration dictionary for valid loop path', () => {
            const innerStep = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
            })
            const loop = LoopStepOutput.init({ input: null }).addIteration()
            if (loop.output) {
                loop.output.iterations[0]['child'] = innerStep
            }
            const steps: Record<string, StepOutput> = { loop }

            const state = executionJournal.getStateAtPath({
                path: [['loop', 0]],
                steps,
            })

            expect(state['child']).toBe(innerStep)
        })

        it('navigates through multiple nested loops', () => {
            const deepStep = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
            })
            const innerLoop = LoopStepOutput.init({ input: null }).addIteration()
            if (innerLoop.output) {
                innerLoop.output.iterations[0]['deep'] = deepStep
            }
            const outerLoop = LoopStepOutput.init({ input: null }).addIteration()
            if (outerLoop.output) {
                outerLoop.output.iterations[0]['inner_loop'] = innerLoop
            }
            const steps: Record<string, StepOutput> = { outer_loop: outerLoop }

            const state = executionJournal.getStateAtPath({
                path: [['outer_loop', 0], ['inner_loop', 0]],
                steps,
            })

            expect(state['deep']).toBe(deepStep)
        })

        it('throws error when parent step in path is not found', () => {
            const steps: Record<string, StepOutput> = {}
            expect(() => {
                executionJournal.getStateAtPath({
                    path: [['missing_step', 0]],
                    steps,
                })
            }).toThrowError('Step missing_step not found in path')
        })

        it('throws error when parent step in path is not LOOP_ON_ITEMS', () => {
            const steps: Record<string, StepOutput> = {
                not_a_loop: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
            }
            expect(() => {
                executionJournal.getStateAtPath({
                    path: [['not_a_loop', 0]],
                    steps,
                })
            }).toThrowError('Step not_a_loop is not a loop on items step in path')
        })

        it('throws error when iteration index does not exist in loop output', () => {
            const loop = LoopStepOutput.init({ input: null })
            const steps: Record<string, StepOutput> = { loop }

            expect(() => {
                executionJournal.getStateAtPath({
                    path: [['loop', 5]],
                    steps,
                })
            }).toThrowError('Iteration 5 not found in path')
        })
    })

    describe('getOrCreateStateAtPath', () => {
        it('returns steps dictionary when path is empty', () => {
            const steps: Record<string, StepOutput> = {}
            const state = executionJournal.getOrCreateStateAtPath({ path: [], steps })
            expect(state).toBe(steps)
        })

        it('creates a loop step and requested iteration when parent does not exist', () => {
            const steps: Record<string, StepOutput> = {}
            const iterationState = executionJournal.getOrCreateStateAtPath({
                path: [['new_loop', 0]],
                steps,
            })

            expect(iterationState).toBeDefined()
            expect(steps['new_loop']).toBeDefined()
            expect(steps['new_loop'].type).toBe(FlowActionType.LOOP_ON_ITEMS)
            const loop = steps['new_loop']
            if (loop.type === FlowActionType.LOOP_ON_ITEMS && loop.output) {
                expect(loop.output.iterations.length).toBe(1)
                expect(loop.output.iterations[0]).toBe(iterationState)
            }
            else {
                expect.unreachable('Expected new_loop to be a loop on items step with output')
            }
        })

        it('adds requested iteration to existing loop step if iteration does not exist', () => {
            const initialLoop = LoopStepOutput.init({ input: null }).addIteration()
            const existingStep = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
            })
            if (initialLoop.output) {
                initialLoop.output.iterations[0]['existing_step'] = existingStep
            }
            const steps: Record<string, StepOutput> = {
                loop_1: initialLoop,
            }

            const secondIterationState = executionJournal.getOrCreateStateAtPath({
                path: [['loop_1', 1]],
                steps,
            })

            expect(secondIterationState).toBeDefined()
            const loop = steps['loop_1']
            if (loop.type === FlowActionType.LOOP_ON_ITEMS && loop.output) {
                expect(loop.output.iterations.length).toBe(2)
                expect(loop.output.iterations[0]['existing_step']).toBe(existingStep)
                expect(loop.output.iterations[1]).toBe(secondIterationState)
            }
            else {
                expect.unreachable('Expected loop_1 to be a loop on items step with output')
            }
        })

        it('returns existing iteration without mutating its contents if iteration already exists', () => {
            const initialLoop = LoopStepOutput.init({ input: null }).addIteration()
            const existingStep = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
            })
            if (initialLoop.output) {
                initialLoop.output.iterations[0]['existing_step'] = existingStep
            }
            const steps: Record<string, StepOutput> = {
                loop_1: initialLoop,
            }

            const state = executionJournal.getOrCreateStateAtPath({
                path: [['loop_1', 0]],
                steps,
            })

            expect(state['existing_step']).toBe(existingStep)
        })

        it('throws error if parent step exists but is not of type LOOP_ON_ITEMS', () => {
            const steps: Record<string, StepOutput> = {
                code_step: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
            }

            expect(() => {
                executionJournal.getOrCreateStateAtPath({
                    path: [['code_step', 0]],
                    steps,
                })
            }).toThrowError('Step code_step is not a loop on items step in path')
        })

        it('creates deeply nested hierarchy of loops and iterations along the path', () => {
            const steps: Record<string, StepOutput> = {}
            const deepState = executionJournal.getOrCreateStateAtPath({
                path: [['outer', 0], ['inner', 0]],
                steps,
            })

            expect(deepState).toBeDefined()
            expect(steps['outer']).toBeDefined()
            const outer = steps['outer']
            if (outer.type === FlowActionType.LOOP_ON_ITEMS && outer.output) {
                const inner = outer.output.iterations[0]['inner']
                expect(inner).toBeDefined()
                expect(inner.type).toBe(FlowActionType.LOOP_ON_ITEMS)
                if (inner.type === FlowActionType.LOOP_ON_ITEMS && inner.output) {
                    expect(inner.output.iterations[0]).toBe(deepState)
                }
                else {
                    expect.unreachable('Expected inner to be a loop on items step with output')
                }
            }
            else {
                expect.unreachable('Expected outer to be a loop on items step with output')
            }
        })
    })

    describe('findLastStepWithStatus', () => {
        it('returns null when steps record is empty', () => {
            expect(executionJournal.findLastStepWithStatus({}, undefined)).toBeNull()
            expect(executionJournal.findLastStepWithStatus({}, StepOutputStatus.SUCCEEDED)).toBeNull()
        })

        it('returns last step encountered when status is undefined', () => {
            const steps: Record<string, StepOutput> = {
                step_1: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
                step_2: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.FAILED,
                }),
            }

            expect(executionJournal.findLastStepWithStatus(steps, undefined)).toBe('step_2')
        })

        it('finds last step with specific matching status at root level', () => {
            const steps: Record<string, StepOutput> = {
                step_1: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
                step_2: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.FAILED,
                }),
                step_3: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
                step_4: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.PAUSED,
                }),
            }

            expect(executionJournal.findLastStepWithStatus(steps, StepOutputStatus.SUCCEEDED)).toBe('step_3')
            expect(executionJournal.findLastStepWithStatus(steps, StepOutputStatus.FAILED)).toBe('step_2')
            expect(executionJournal.findLastStepWithStatus(steps, StepOutputStatus.PAUSED)).toBe('step_4')
            expect(executionJournal.findLastStepWithStatus(steps, StepOutputStatus.STOPPED)).toBeNull()
        })

        it('traverses into loop iterations and identifies nested step with matching status', () => {
            let loop = LoopStepOutput.init({ input: null }).addIteration()
            if (loop.output) {
                loop.output.iterations[0]['loop_child_1'] = GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                })
                loop.output.iterations[0]['loop_child_failed'] = GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.FAILED,
                })
            }
            const steps: Record<string, StepOutput> = {
                step_1: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
                loop_step: loop,
            }

            expect(executionJournal.findLastStepWithStatus(steps, StepOutputStatus.FAILED)).toBe('loop_child_failed')
            // For SUCCEEDED: step_1 matched, then loop_child_1 matched, then loop_step itself is SUCCEEDED so loop_step wins
            expect(executionJournal.findLastStepWithStatus(steps, StepOutputStatus.SUCCEEDED)).toBe('loop_step')
        })

        it('returns subsequent step outside loop when it matches status after a nested match', () => {
            let loop = LoopStepOutput.init({ input: null }).addIteration()
            if (loop.output) {
                loop.output.iterations[0]['nested_failed'] = GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.FAILED,
                })
            }
            const steps: Record<string, StepOutput> = {
                loop_step: loop,
                final_failed: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.FAILED,
                }),
            }

            expect(executionJournal.findLastStepWithStatus(steps, StepOutputStatus.FAILED)).toBe('final_failed')
        })
    })

    describe('getLoopSteps', () => {
        it('returns empty record when no loop steps exist', () => {
            const steps: Record<string, StepOutput> = {
                step_1: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
            }

            expect(executionJournal.getLoopSteps(steps)).toEqual({})
        })

        it('collects top-level loop steps', () => {
            const loop1 = LoopStepOutput.init({ input: null })
            const loop2 = LoopStepOutput.init({ input: null })
            const steps: Record<string, StepOutput> = {
                step_1: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
                loop_1: loop1,
                loop_2: loop2,
            }

            const loopSteps = executionJournal.getLoopSteps(steps)
            expect(Object.keys(loopSteps).sort()).toEqual(['loop_1', 'loop_2'])
            expect(loopSteps['loop_1']).toBe(loop1)
            expect(loopSteps['loop_2']).toBe(loop2)
        })

        it('collects nested loop steps across multiple iterations', () => {
            const innerLoop1 = LoopStepOutput.init({ input: 'inner1' })
            const innerLoop2 = LoopStepOutput.init({ input: 'inner2' })
            let outerLoop = LoopStepOutput.init({ input: 'outer' }).addIteration().addIteration()
            if (outerLoop.output) {
                outerLoop.output.iterations[0]['inner_loop_1'] = innerLoop1
                outerLoop.output.iterations[1]['inner_loop_2'] = innerLoop2
            }
            const steps: Record<string, StepOutput> = {
                outer_loop: outerLoop,
            }

            const loopSteps = executionJournal.getLoopSteps(steps)
            expect(Object.keys(loopSteps).sort()).toEqual(['inner_loop_1', 'inner_loop_2', 'outer_loop'])
            expect(loopSteps['inner_loop_1']).toBe(innerLoop1)
            expect(loopSteps['inner_loop_2']).toBe(innerLoop2)
            expect(loopSteps['outer_loop']).toBe(outerLoop)
        })
    })

    describe('isChildOf', () => {
        it('returns false when parent is not LOOP_ON_ITEMS', () => {
            const nonLoop = GenericStepOutput.create({
                input: null,
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
            })
            expect(executionJournal.isChildOf(nonLoop, 'child_step')).toBe(false)
        })

        it('returns false when parent loop output is missing or has no iterations', () => {
            const emptyLoop = LoopStepOutput.init({ input: null })
            expect(executionJournal.isChildOf(emptyLoop, 'child_step')).toBe(false)
        })

        it('returns true when child step exists directly in an iteration', () => {
            let loop = LoopStepOutput.init({ input: null }).addIteration()
            if (loop.output) {
                loop.output.iterations[0]['direct_child'] = GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                })
            }

            expect(executionJournal.isChildOf(loop, 'direct_child')).toBe(true)
            expect(executionJournal.isChildOf(loop, 'other_step')).toBe(false)
        })

        it('returns true when child step exists deeply inside a nested loop', () => {
            let innerLoop = LoopStepOutput.init({ input: null }).addIteration()
            if (innerLoop.output) {
                innerLoop.output.iterations[0]['deep_child'] = GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                })
            }
            let outerLoop = LoopStepOutput.init({ input: null }).addIteration()
            if (outerLoop.output) {
                outerLoop.output.iterations[0]['inner_loop'] = innerLoop
            }

            expect(executionJournal.isChildOf(outerLoop, 'deep_child')).toBe(true)
            expect(executionJournal.isChildOf(outerLoop, 'non_existent')).toBe(false)
        })
    })

    describe('getPathToStep', () => {
        it('returns empty path when step is at root level', () => {
            const steps: Record<string, StepOutput> = {
                step_root: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
            }

            const path = executionJournal.getPathToStep(steps, 'step_root', {})
            expect(path).toEqual([])
        })

        it('returns path to step inside a single loop using loopsIndexes', () => {
            let loop = LoopStepOutput.init({ input: null }).addIteration().addIteration()
            if (loop.output) {
                loop.output.iterations[1]['step_in_loop'] = GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                })
            }
            const steps: Record<string, StepOutput> = {
                loop_1: loop,
            }

            const path = executionJournal.getPathToStep(steps, 'step_in_loop', { loop_1: 1 })
            expect(path).toEqual([['loop_1', 1]])
        })

        it('returns nested path to step deeply inside nested loops', () => {
            let innerLoop = LoopStepOutput.init({ input: null }).addIteration()
            if (innerLoop.output) {
                innerLoop.output.iterations[0]['deep_step'] = GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                })
            }
            let outerLoop = LoopStepOutput.init({ input: null }).addIteration()
            if (outerLoop.output) {
                outerLoop.output.iterations[0]['inner_loop'] = innerLoop
            }
            const steps: Record<string, StepOutput> = {
                outer_loop: outerLoop,
            }

            const path = executionJournal.getPathToStep(steps, 'deep_step', {
                outer_loop: 0,
                inner_loop: 0,
            })
            expect(path).toEqual([['outer_loop', 0], ['inner_loop', 0]])
        })

        it('returns undefined when step is not present in steps tree', () => {
            let loop = LoopStepOutput.init({ input: null }).addIteration()
            const steps: Record<string, StepOutput> = {
                loop_1: loop,
                step_1: GenericStepOutput.create({
                    input: null,
                    type: FlowActionType.CODE,
                    status: StepOutputStatus.SUCCEEDED,
                }),
            }

            const path = executionJournal.getPathToStep(steps, 'missing_step', { loop_1: 0 })
            expect(path).toBeUndefined()
        })
    })
})
