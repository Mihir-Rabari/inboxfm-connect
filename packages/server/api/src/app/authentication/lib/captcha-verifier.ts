import { ActivepiecesError, ErrorCode, isNil, spreadIfDefined, tryCatch } from '@inboxfm-connect/core-utils'
import { safeHttp } from '@inboxfm-connect/server-utils'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp, CaptchaProvider } from '../../helper/system/system-props'

// Optional, off-by-default anti-bot check on sign-up (see .claude/rules/self-hosting.md:
// zero setup by default). CE users who never set AP_CAPTCHA_PROVIDER get byte-for-byte
// the same sign-up behavior as before this feature existed — `assertValidCaptcha`
// returns immediately. Once AP_CAPTCHA_PROVIDER and AP_CAPTCHA_SECRET_KEY are both set,
// sign-up additionally verifies the client-supplied `captchaToken` against the
// configured provider's siteverify endpoint before creating the identity.
export const captchaVerifier = (log: FastifyBaseLogger) => ({
    async assertValidCaptcha({ token, remoteIp }: AssertValidCaptchaParams): Promise<void> {
        const provider = system.get<CaptchaProvider>(AppSystemProp.CAPTCHA_PROVIDER)
        if (isNil(provider)) {
            return
        }
        if (isNil(token) || token.trim() === '') {
            throw new ActivepiecesError({
                code: ErrorCode.CAPTCHA_VERIFICATION_FAILED,
                params: { provider },
            })
        }

        const secretKey = system.getOrThrow(AppSystemProp.CAPTCHA_SECRET_KEY)
        const { verifyUrl } = PROVIDER_VERIFY_CONFIG[provider]
        const { data: response, error } = await tryCatch(() => safeHttp.axios.post<CaptchaProviderResponse>(
            verifyUrl,
            new URLSearchParams({
                secret: secretKey,
                response: token,
                ...spreadIfDefined('remoteip', remoteIp),
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 5000,
            },
        ))

        if (error !== null) {
            log.warn({ provider, error }, 'CAPTCHA verification request failed')
            throw new ActivepiecesError({
                code: ErrorCode.CAPTCHA_VERIFICATION_FAILED,
                params: { provider },
            })
        }
        if (!response.data.success) {
            throw new ActivepiecesError({
                code: ErrorCode.CAPTCHA_VERIFICATION_FAILED,
                params: { provider },
            })
        }
    },
})

// hCaptcha and Cloudflare Turnstile both accept POST secret + response(+remoteip) and
// return { success: boolean } — one small map covers both providers.
const PROVIDER_VERIFY_CONFIG: Record<CaptchaProvider, { verifyUrl: string }> = {
    [CaptchaProvider.HCAPTCHA]: { verifyUrl: 'https://hcaptcha.com/siteverify' },
    [CaptchaProvider.TURNSTILE]: { verifyUrl: 'https://challenges.cloudflare.com/turnstile/v0/siteverify' },
}

type AssertValidCaptchaParams = {
    token: string | undefined
    remoteIp: string | undefined
}

type CaptchaProviderResponse = {
    success: boolean
}
