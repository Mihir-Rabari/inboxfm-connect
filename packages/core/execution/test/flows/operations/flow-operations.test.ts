import { describe, expect, it } from 'vitest'
import {
    BranchExecutionType,
    BranchOperator,
    CodeAction,
    ContinueOnFailureBranches,
    FlowAction,
    FlowActionType,
    LoopOnItemsAction,
    PieceAction,
    RouterAction,
    RouterActionSettings,
    RouterExecutionType,
} from '../../../src/lib/flows/actions/action'
import { FlowVersion, FlowVersionState } from '../../../src/lib/flows/flow-version'
import { _deleteAction } from '../../../src/lib/flows/operations/delete-action'
import { _duplicateBranch, _duplicateStep } from '../../../src/lib/flows/operations/duplicate-step'
import { _moveAction } from '../../../src/lib/flows/operations/move-action'
import { _skipAction } from '../../../src/lib/flows/operations/skip-action'
import {
    FlowOperationType,
    flowOperations,
    StepLocationRelativeToParent,
} from '../../../src/lib/flows/operations'
import { FlowTriggerType } from '../../../src/lib/flows/triggers/trigger'
import { flowStructureUtil } from '../../../src/lib/flows/util/flow-structure-util'

describe('Flow Operations: Delete, Skip, Duplicate, and Move', () => {
    describe('_deleteAction', () => {
        it('deletes immediate child of trigger and points trigger to nextAction', () => {
            const step2 = createCodeAction({ name: 'step_2' })
            const step1 = createCodeAction({ name: 'step_1', nextAction: step2 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const updated = _deleteAction(flowVersion, { names: ['step_1'] })

            expect(updated.trigger.nextAction?.name).toBe('step_2')
            expect(updated.trigger.nextAction?.nextAction).toBeUndefined()
        })

        it('deletes middle action in sequential chain and connects preceding to succeeding', () => {
            const step3 = createCodeAction({ name: 'step_3' })
            const step2 = createCodeAction({ name: 'step_2', nextAction: step3 })
            const step1 = createCodeAction({ name: 'step_1', nextAction: step2 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const updated = _deleteAction(flowVersion, { names: ['step_2'] })

            const next1 = updated.trigger.nextAction
            expect(next1?.name).toBe('step_1')
            expect(next1?.nextAction?.name).toBe('step_3')
            expect(next1?.nextAction?.nextAction).toBeUndefined()
        })

        it('deletes leaf action at end of chain', () => {
            const step2 = createCodeAction({ name: 'step_2' })
            const step1 = createCodeAction({ name: 'step_1', nextAction: step2 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const updated = _deleteAction(flowVersion, { names: ['step_2'] })

            expect(updated.trigger.nextAction?.name).toBe('step_1')
            expect(updated.trigger.nextAction?.nextAction).toBeUndefined()
        })

        it('deletes firstLoopAction inside a loop and updates loop head to nextAction', () => {
            const loopChild2 = createCodeAction({ name: 'loop_child_2' })
            const loopChild1 = createCodeAction({ name: 'loop_child_1', nextAction: loopChild2 })
            const loop = createLoopAction({ name: 'loop_1', firstLoopAction: loopChild1 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: loop })

            const updated = _deleteAction(flowVersion, { names: ['loop_child_1'] })

            const updatedLoop = updated.trigger.nextAction
            if (updatedLoop?.type === FlowActionType.LOOP_ON_ITEMS) {
                expect(updatedLoop.firstLoopAction?.name).toBe('loop_child_2')
                expect(updatedLoop.firstLoopAction?.nextAction).toBeUndefined()
            }
            else {
                expect.unreachable('Expected loop_1 to be a loop action')
            }
        })

        it('deletes child inside router branch and replaces with child nextAction or null', () => {
            const branch1Child2 = createCodeAction({ name: 'b1_child_2' })
            const branch1Child1 = createCodeAction({ name: 'b1_child_1', nextAction: branch1Child2 })
            const branch2Child = createCodeAction({ name: 'b2_child' })
            const router = createRouterAction({
                name: 'router_1',
                branches: [
                    {
                        branchName: 'Branch 1',
                        branchType: BranchExecutionType.CONDITION,
                        conditions: [
                            [
                                {
                                    firstValue: '1',
                                    secondValue: '1',
                                    operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                                    caseSensitive: false,
                                },
                            ],
                        ],
                    },
                    {
                        branchName: 'Branch 2',
                        branchType: BranchExecutionType.FALLBACK,
                    },
                ],
                children: [branch1Child1, branch2Child],
            })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: router })

            // Delete b1_child_1 -> branch 0 child becomes b1_child_2
            const updated1 = _deleteAction(flowVersion, { names: ['b1_child_1'] })
            const router1 = updated1.trigger.nextAction
            if (router1?.type === FlowActionType.ROUTER) {
                expect(router1.children[0]?.name).toBe('b1_child_2')
                expect(router1.children[1]?.name).toBe('b2_child')
            }
            else {
                expect.unreachable('Expected router_1 to be a router action')
            }

            // Delete b2_child -> branch 1 child becomes null
            const updated2 = _deleteAction(updated1, { names: ['b2_child'] })
            const router2 = updated2.trigger.nextAction
            if (router2?.type === FlowActionType.ROUTER) {
                expect(router2.children[0]?.name).toBe('b1_child_2')
                expect(router2.children[1]).toBeNull()
            }
            else {
                expect.unreachable('Expected router_1 to be a router action')
            }
        })

        it('deletes action inside continueOnFailureBranches (onSuccess and onFailure)', () => {
            const successNext = createCodeAction({ name: 'success_next' })
            const successStep = createCodeAction({ name: 'on_success_step', nextAction: successNext })
            const failureStep = createCodeAction({ name: 'on_failure_step' })
            const pieceWithBranches = createPieceAction({
                name: 'piece_step',
                continueOnFailureBranches: {
                    onSuccess: successStep,
                    onFailure: failureStep,
                },
            })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: pieceWithBranches })

            const updated = _deleteAction(flowVersion, { names: ['on_success_step', 'on_failure_step'] })

            const piece = updated.trigger.nextAction
            if (piece?.type === FlowActionType.PIECE) {
                expect(piece.continueOnFailureBranches?.onSuccess?.name).toBe('success_next')
                expect(piece.continueOnFailureBranches?.onFailure).toBeUndefined()
            }
            else {
                expect.unreachable('Expected piece_step to be a piece action')
            }
        })

        it('handles non-existent names gracefully without changing the flow', () => {
            const step1 = createCodeAction({ name: 'step_1' })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const updated = _deleteAction(flowVersion, { names: ['unknown_step'] })

            expect(updated.trigger.nextAction?.name).toBe('step_1')
        })

        it('executes via flowOperations.apply with DELETE_ACTION operation', () => {
            const step2 = createCodeAction({ name: 'step_2' })
            const step1 = createCodeAction({ name: 'step_1', nextAction: step2 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const updated = flowOperations.apply(flowVersion, {
                type: FlowOperationType.DELETE_ACTION,
                request: { names: ['step_1'] },
            })

            expect(updated.trigger.nextAction?.name).toBe('step_2')
        })
    })

    describe('_skipAction', () => {
        it('sets skip flag to true on targeted steps', () => {
            const step2 = createCodeAction({ name: 'step_2' })
            const step1 = createCodeAction({ name: 'step_1', nextAction: step2 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const updated = _skipAction(flowVersion, { names: ['step_1'], skip: true })

            expect(updated.trigger.nextAction?.skip).toBe(true)
            expect(updated.trigger.nextAction?.nextAction?.skip).toBe(false)
        })

        it('sets skip flag to false to unskip previously skipped steps', () => {
            const step1 = createCodeAction({ name: 'step_1', skip: true })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const updated = _skipAction(flowVersion, { names: ['step_1'], skip: false })

            expect(updated.trigger.nextAction?.skip).toBe(false)
        })

        it('updates multiple steps simultaneously', () => {
            const step3 = createCodeAction({ name: 'step_3' })
            const step2 = createCodeAction({ name: 'step_2', nextAction: step3 })
            const step1 = createCodeAction({ name: 'step_1', nextAction: step2 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const updated = _skipAction(flowVersion, { names: ['step_1', 'step_3'], skip: true })

            expect(updated.trigger.nextAction?.skip).toBe(true)
            expect(updated.trigger.nextAction?.nextAction?.skip).toBe(false)
            expect(updated.trigger.nextAction?.nextAction?.nextAction?.skip).toBe(true)
        })

        it('updates nested actions inside loops and routers', () => {
            const loopChild = createCodeAction({ name: 'loop_child' })
            const loop = createLoopAction({ name: 'loop_1', firstLoopAction: loopChild })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: loop })

            const updated = _skipAction(flowVersion, { names: ['loop_child'], skip: true })

            const updatedLoop = updated.trigger.nextAction
            if (updatedLoop?.type === FlowActionType.LOOP_ON_ITEMS) {
                expect(updatedLoop.firstLoopAction?.skip).toBe(true)
            }
            else {
                expect.unreachable('Expected loop_1 to be a loop action')
            }
        })

        it('dispatches through flowOperations.apply with SET_SKIP_ACTION and updates flow valid status', () => {
            const invalidAction = createCodeAction({ name: 'step_invalid', valid: false })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: invalidAction })
            expect(flowStructureUtil.getAllSteps(flowVersion.trigger).every((s) => s.valid)).toBe(false)

            // When skipped, invalid actions do not invalidate the overall flow
            const updated = flowOperations.apply(flowVersion, {
                type: FlowOperationType.SET_SKIP_ACTION,
                request: { names: ['step_invalid'], skip: true },
            })

            expect(updated.trigger.nextAction?.skip).toBe(true)
            expect(updated.valid).toBe(true)
        })
    })

    describe('_duplicateStep and _duplicateBranch', () => {
        it('duplicates step and generates ADD_ACTION request located AFTER parent step', () => {
            const step2 = createCodeAction({ name: 'step_2' })
            const step1 = createCodeAction({ name: 'step_1', nextAction: step2 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const operations = _duplicateStep('step_1', flowVersion)

            expect(operations.length).toBeGreaterThanOrEqual(1)
            const addOp = operations[0]
            expect(addOp.type).toBe(FlowOperationType.ADD_ACTION)
            if (addOp.type === FlowOperationType.ADD_ACTION) {
                expect(addOp.request.parentStep).toBe('step_1')
                expect(addOp.request.stepLocationRelativeToParent).toBe(StepLocationRelativeToParent.AFTER)
                expect(addOp.request.action.name).not.toBe('step_1')
                expect(addOp.request.action.displayName).toContain('Copy')
            }
        })

        it('duplicates step via flowOperations.apply and places the clone in flow hierarchy', () => {
            const step1 = createCodeAction({ name: 'step_1' })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const updated = flowOperations.apply(flowVersion, {
                type: FlowOperationType.DUPLICATE_ACTION,
                request: { stepName: 'step_1' },
            })

            const firstStep = updated.trigger.nextAction
            expect(firstStep?.name).toBe('step_1')
            const clonedStep = firstStep?.nextAction
            expect(clonedStep).toBeDefined()
            expect(clonedStep?.displayName).toBe('Code Action Copy')
        })

        it('duplicates router branch with conditions and generates ADD_BRANCH operation', () => {
            const branchChild = createCodeAction({ name: 'branch_child' })
            const router = createRouterAction({
                name: 'router_1',
                branches: [
                    {
                        branchName: 'Original Branch',
                        branchType: BranchExecutionType.CONDITION,
                        conditions: [
                            [
                                {
                                    firstValue: 'status',
                                    secondValue: 'active',
                                    operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                                    caseSensitive: false,
                                },
                            ],
                        ],
                    },
                ],
                children: [branchChild],
            })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: router })

            const operations = _duplicateBranch('router_1', 0, flowVersion)

            expect(operations.length).toBeGreaterThanOrEqual(2)
            const addBranchOp = operations[0]
            expect(addBranchOp.type).toBe(FlowOperationType.ADD_BRANCH)
            if (addBranchOp.type === FlowOperationType.ADD_BRANCH) {
                expect(addBranchOp.request.stepName).toBe('router_1')
                expect(addBranchOp.request.branchIndex).toBe(1)
                expect(addBranchOp.request.branchName).toBe('Original Branch Copy')
                expect(addBranchOp.request.conditions?.[0]?.[0]?.firstValue).toBe('status')
            }

            const addActionOp = operations[1]
            expect(addActionOp.type).toBe(FlowOperationType.ADD_ACTION)
            if (addActionOp.type === FlowOperationType.ADD_ACTION) {
                expect(addActionOp.request.parentStep).toBe('router_1')
                expect(addActionOp.request.branchIndex).toBe(1)
                expect(addActionOp.request.stepLocationRelativeToParent).toBe(StepLocationRelativeToParent.INSIDE_BRANCH)
            }
        })

        it('duplicates branch via flowOperations.apply DUPLICATE_BRANCH and updates router branches', () => {
            const router = createRouterAction({
                name: 'router_1',
                branches: [
                    {
                        branchName: 'First Branch',
                        branchType: BranchExecutionType.CONDITION,
                        conditions: [
                            [
                                {
                                    firstValue: 'type',
                                    secondValue: 'event',
                                    operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                                    caseSensitive: false,
                                },
                            ],
                        ],
                    },
                ],
                children: [null],
            })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: router })

            const updated = flowOperations.apply(flowVersion, {
                type: FlowOperationType.DUPLICATE_BRANCH,
                request: { stepName: 'router_1', branchIndex: 0 },
            })

            const updatedRouter = updated.trigger.nextAction
            if (updatedRouter?.type === FlowActionType.ROUTER) {
                expect(updatedRouter.settings.branches.length).toBe(2)
                expect(updatedRouter.settings.branches[0].branchName).toBe('First Branch')
                expect(updatedRouter.settings.branches[1].branchName).toBe('First Branch Copy')
            }
            else {
                expect.unreachable('Expected router_1 to be a router action')
            }
        })
    })

    describe('_moveAction', () => {
        it('generates DELETE_ACTION followed by ADD_ACTION with target location', () => {
            const step2 = createCodeAction({ name: 'step_2' })
            const step1 = createCodeAction({ name: 'step_1', nextAction: step2 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            const operations = _moveAction(flowVersion, {
                name: 'step_2',
                newParentStep: 'trigger',
                stepLocationRelativeToNewParent: StepLocationRelativeToParent.AFTER,
            })

            expect(operations.length).toBeGreaterThanOrEqual(2)
            expect(operations[0].type).toBe(FlowOperationType.DELETE_ACTION)
            if (operations[0].type === FlowOperationType.DELETE_ACTION) {
                expect(operations[0].request.names).toEqual(['step_2'])
            }

            expect(operations[1].type).toBe(FlowOperationType.ADD_ACTION)
            if (operations[1].type === FlowOperationType.ADD_ACTION) {
                expect(operations[1].request.parentStep).toBe('trigger')
                expect(operations[1].request.stepLocationRelativeToParent).toBe(StepLocationRelativeToParent.AFTER)
                expect(operations[1].request.action.name).toBe('step_2')
            }
        })

        it('moves an action after another action via flowOperations.apply', () => {
            const step3 = createCodeAction({ name: 'step_3' })
            const step2 = createCodeAction({ name: 'step_2', nextAction: step3 })
            const step1 = createCodeAction({ name: 'step_1', nextAction: step2 })
            const flowVersion = createBaseFlowVersion({ triggerNextAction: step1 })

            // Move step_3 to be immediately AFTER step_1: order becomes step_1 -> step_3 -> step_2
            const updated = flowOperations.apply(flowVersion, {
                type: FlowOperationType.MOVE_ACTION,
                request: {
                    name: 'step_3',
                    newParentStep: 'step_1',
                    stepLocationRelativeToNewParent: StepLocationRelativeToParent.AFTER,
                },
            })

            const first = updated.trigger.nextAction
            expect(first?.name).toBe('step_1')
            const second = first?.nextAction
            expect(second?.name).toBe('step_3')
            const third = second?.nextAction
            expect(third?.name).toBe('step_2')
            expect(third?.nextAction).toBeUndefined()
        })

        it('moves an action into a loop using INSIDE_LOOP via flowOperations.apply', () => {
            const loop = createLoopAction({ name: 'loop_1' })
            const stepToMove = createCodeAction({ name: 'step_to_move' })
            const initialStep = createCodeAction({ name: 'step_initial', nextAction: stepToMove })
            loop.nextAction = initialStep
            const flowVersion = createBaseFlowVersion({ triggerNextAction: loop })

            const updated = flowOperations.apply(flowVersion, {
                type: FlowOperationType.MOVE_ACTION,
                request: {
                    name: 'step_to_move',
                    newParentStep: 'loop_1',
                    stepLocationRelativeToNewParent: StepLocationRelativeToParent.INSIDE_LOOP,
                },
            })

            const updatedLoop = updated.trigger.nextAction
            if (updatedLoop?.type === FlowActionType.LOOP_ON_ITEMS) {
                expect(updatedLoop.firstLoopAction?.name).toBe('step_to_move')
                expect(updatedLoop.nextAction?.name).toBe('step_initial')
                expect(updatedLoop.nextAction?.nextAction).toBeUndefined()
            }
            else {
                expect.unreachable('Expected loop_1 to be a loop action')
            }
        })
    })
})

function createBaseFlowVersion({
    triggerNextAction,
}: {
    triggerNextAction?: FlowAction
} = {}): FlowVersion {
    return {
        id: 'flow-version-1',
        created: '2026-10-06T00:00:00.000Z',
        updated: '2026-10-06T00:00:00.000Z',
        flowId: 'flow-1',
        displayName: 'Test Flow',
        valid: true,
        state: FlowVersionState.DRAFT,
        schemaVersion: '22',
        updatedBy: null,
        agentIds: [],
        connectionIds: [],
        backupFiles: null,
        notes: [],
        trigger: {
            name: 'trigger',
            displayName: 'Select a Trigger',
            type: FlowTriggerType.EMPTY,
            valid: true,
            lastUpdatedDate: '2026-10-06T00:00:00.000Z',
            settings: {},
            nextAction: triggerNextAction,
        },
    }
}

function createCodeAction({
    name,
    displayName = 'Code Action',
    valid = true,
    skip = false,
    nextAction,
    continueOnFailureBranches,
}: {
    name: string
    displayName?: string
    valid?: boolean
    skip?: boolean
    nextAction?: FlowAction
    continueOnFailureBranches?: ContinueOnFailureBranches
}): CodeAction {
    return {
        name,
        displayName,
        type: FlowActionType.CODE,
        valid,
        skip,
        lastUpdatedDate: '2026-10-06T00:00:00.000Z',
        settings: {
            input: {},
            sourceCode: {
                code: 'return true;',
                packageJson: '{}',
            },
        },
        nextAction,
        continueOnFailureBranches,
    }
}

function createPieceAction({
    name,
    displayName = 'Piece Action',
    valid = true,
    skip = false,
    nextAction,
    continueOnFailureBranches,
}: {
    name: string
    displayName?: string
    valid?: boolean
    skip?: boolean
    nextAction?: FlowAction
    continueOnFailureBranches?: ContinueOnFailureBranches
}): PieceAction {
    return {
        name,
        displayName,
        type: FlowActionType.PIECE,
        valid,
        skip,
        lastUpdatedDate: '2026-10-06T00:00:00.000Z',
        settings: {
            pieceName: '@inboxfm-connect/piece-http',
            pieceVersion: '1.0.0',
            propertySettings: {},
            input: {},
        },
        nextAction,
        continueOnFailureBranches,
    }
}

function createLoopAction({
    name,
    displayName = 'Loop Action',
    firstLoopAction,
    nextAction,
}: {
    name: string
    displayName?: string
    firstLoopAction?: FlowAction
    nextAction?: FlowAction
}): LoopOnItemsAction {
    return {
        name,
        displayName,
        type: FlowActionType.LOOP_ON_ITEMS,
        valid: true,
        lastUpdatedDate: '2026-10-06T00:00:00.000Z',
        settings: {
            items: '["item1", "item2"]',
        },
        firstLoopAction,
        nextAction,
    }
}

function createRouterAction({
    name,
    displayName = 'Router Action',
    branches,
    children,
    nextAction,
}: {
    name: string
    displayName?: string
    branches: RouterActionSettings['branches']
    children: (FlowAction | null)[]
    nextAction?: FlowAction
}): RouterAction {
    return {
        name,
        displayName,
        type: FlowActionType.ROUTER,
        valid: true,
        lastUpdatedDate: '2026-10-06T00:00:00.000Z',
        settings: {
            executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
            branches,
        },
        children,
        nextAction,
    }
}
