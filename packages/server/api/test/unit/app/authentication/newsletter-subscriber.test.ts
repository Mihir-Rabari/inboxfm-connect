import { ApEnvironment, UserIdentity, UserIdentityProvider } from '@inboxfm-connect/shared'
import { safeHttp } from '@inboxfm-connect/server-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticationUtils } from '../../../../src/app/authentication/authentication-utils'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'

describe('saveNewsLetterSubscriber', () => {
    const mockLog = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    } as any

    const mockIdentity: UserIdentity = {
        id: 'user_123',
        email: 'developer@example.com',
        firstName: 'Dev',
        lastName: 'User',
        trackEvents: true,
        newsLetter: true,
        provider: UserIdentityProvider.EMAIL_AND_PASSWORD,
        password: 'hashed_password',
        verified: true,
        created: '2026-09-27T00:00:00.000Z',
        updated: '2026-09-27T00:00:00.000Z',
    }

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('defaults to OFF: does not send user PII or call safeHttp when UPSTREAM_NEWSLETTER_OPT_IN is unset', async () => {
        const postSpy = vi.spyOn(safeHttp.axios, 'post').mockResolvedValue({} as any)
        vi.spyOn(system, 'getBoolean').mockReturnValue(false)
        vi.spyOn(system, 'get').mockReturnValue(ApEnvironment.PRODUCTION)

        const utils = authenticationUtils(mockLog)
        await utils.saveNewsLetterSubscriber(mockIdentity)

        expect(postSpy).not.toHaveBeenCalled()
    })

    it('does not send user PII when environment is not PRODUCTION even if opt-in is true', async () => {
        const postSpy = vi.spyOn(safeHttp.axios, 'post').mockResolvedValue({} as any)
        vi.spyOn(system, 'getBoolean').mockReturnValue(true)
        vi.spyOn(system, 'get').mockReturnValue(ApEnvironment.DEVELOPMENT)

        const utils = authenticationUtils(mockLog)
        await utils.saveNewsLetterSubscriber(mockIdentity)

        expect(postSpy).not.toHaveBeenCalled()
    })

    it('routes through safeHttp.axios when UPSTREAM_NEWSLETTER_OPT_IN is explicitly enabled in PRODUCTION', async () => {
        const postSpy = vi.spyOn(safeHttp.axios, 'post').mockResolvedValue({} as any)
        vi.spyOn(system, 'getBoolean').mockImplementation((prop) => {
            if (prop === AppSystemProp.UPSTREAM_NEWSLETTER_OPT_IN) {
                return true
            }
            return false
        })
        vi.spyOn(system, 'get').mockReturnValue(ApEnvironment.PRODUCTION)

        const utils = authenticationUtils(mockLog)
        await utils.saveNewsLetterSubscriber(mockIdentity)

        expect(postSpy).toHaveBeenCalledTimes(1)
        expect(postSpy).toHaveBeenCalledWith(
            'https://us-central1-activepieces-b3803.cloudfunctions.net/addContact',
            { email: 'developer@example.com' },
            expect.objectContaining({
                headers: {
                    'Content-Type': 'application/json',
                },
            }),
        )
    })

    it('gracefully catches and logs errors if safeHttp fails without throwing unhandled exceptions', async () => {
        vi.spyOn(safeHttp.axios, 'post').mockRejectedValue(new Error('Network unreachable'))
        vi.spyOn(system, 'getBoolean').mockReturnValue(true)
        vi.spyOn(system, 'get').mockReturnValue(ApEnvironment.PRODUCTION)

        const utils = authenticationUtils(mockLog)
        await expect(utils.saveNewsLetterSubscriber(mockIdentity)).resolves.toBeUndefined()
        expect(mockLog.warn).toHaveBeenCalled()
    })
})
