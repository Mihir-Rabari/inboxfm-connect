import { describe, expect, it, vi } from 'vitest'
import { ExecutionErrorType, PropsValidationError } from '@inboxfm-connect/shared'

/**
 * Issue #169 — the behaviour change is at the throw site, not just the error
 * class. This mocks the two collaborators `pieceHelper.executeTool` reaches for
 * (the piece loader and the props processor) so the failure path can be driven
 * directly, with no network and no real piece.
 */

const { getPieceAndActionOrThrowMock, applyProcessorsAndValidatorsMock } = vi.hoisted(() => ({
    getPieceAndActionOrThrowMock: vi.fn(),
    applyProcessorsAndValidatorsMock: vi.fn(),
}))

vi.mock('../../src/lib/helper/piece-loader', () => ({
    pieceLoader: { getPieceAndActionOrThrow: getPieceAndActionOrThrowMock },
}))

vi.mock('../../src/lib/variables/props-processor', () => ({
    propsProcessor: { applyProcessorsAndValidators: applyProcessorsAndValidatorsMock },
}))

import { pieceHelper } from '../../src/lib/helper/piece-helper'

const PIECE = {
    name: '@inboxfm-connect/piece-github',
    version: '0.3.4',
    auth: { type: 'OAUTH2' },
    supportedActions: { create_issue: 'Create Issue' },
    description: '',
    authors: [],
    categories: [],
    repoUrl: '',
    codeDir: '',
    tags: [],
    packageType: 'REGISTRY',
    pieceType: 'OFFICIAL',
    logoUrl: '',
    platformId: 'platform-1',
}

function setUp({ errors }: { errors: Record<string, string> }): void {
    getPieceAndActionOrThrowMock.mockResolvedValue({
        piece: PIECE,
        pieceAction: { name: 'create_issue', props: {}, requireAuth: true },
    })
    applyProcessorsAndValidatorsMock.mockResolvedValue({
        processedInput: {},
        errors,
    })
}

const PARAMS = {
    pieceName: '@inboxfm-connect/piece-github',
    pieceVersion: '0.3.4',
    actionName: 'create_issue',
    input: { title: 'hello' },
    engineToken: 'token',
    internalApiUrl: 'http://internal',
    publicApiUrl: 'https://public',
    timeoutInSeconds: 30,
    platformId: 'platform-1',
    projectId: 'project-1',
}

describe('pieceHelper.executeTool prop validation (Issue #169)', () => {
    it('throws PropsValidationError when props fail validation', async () => {
        setUp({ errors: { title: 'Required' } })

        await expect(
            pieceHelper.executeTool({ params: PARAMS as never, devPieces: [] }),
        ).rejects.toBeInstanceOf(PropsValidationError)
    })

    it('exposes the per-field errors on the thrown error', async () => {
        setUp({ errors: { title: 'Required', body: 'Must be a string' } })

        const error = await pieceHelper
            .executeTool({ params: PARAMS as never, devPieces: [] })
            .then(() => null)
            .catch((e: unknown) => e)

        expect(error).toBeInstanceOf(PropsValidationError)
        expect((error as PropsValidationError).errors).toEqual({
            title: 'Required',
            body: 'Must be a string',
        })
    })

    it('classifies the failure as a USER error, not an internal fault', async () => {
        setUp({ errors: { title: 'Required' } })

        const error = await pieceHelper
            .executeTool({ params: PARAMS as never, devPieces: [] })
            .then(() => null)
            .catch((e: unknown) => e)

        expect((error as PropsValidationError).type).toBe(ExecutionErrorType.USER)
    })

    it('no longer throws a bare Error, so the type is recoverable', async () => {
        setUp({ errors: { title: 'Required' } })

        const error = await pieceHelper
            .executeTool({ params: PARAMS as never, devPieces: [] })
            .then(() => null)
            .catch((e: unknown) => e)

        // The old behaviour was `new Error(JSON.stringify(errors, null, 2))`,
        // which was indistinguishable from any other internal failure.
        expect(error).not.toBeInstanceOf(Error)
        expect((error as PropsValidationError).name).not.toBe('Error')
    })

    it('does not throw when validation passes', async () => {
        setUp({ errors: {} })
        // The happy path proceeds into context creation / action execution, which
        // is out of scope here. What matters is that validation did not throw.
        const error = await pieceHelper
            .executeTool({ params: PARAMS as never, devPieces: [] })
            .then(() => null)
            .catch((e: unknown) => e)

        expect(error).not.toBeInstanceOf(PropsValidationError)
    })
})
