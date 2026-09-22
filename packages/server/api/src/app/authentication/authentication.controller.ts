import { RateLimitOptions } from '@fastify/rate-limit'
import { ActivepiecesError, ErrorCode, isNil, tryCatch } from '@inboxfm-connect/core-utils'
import { ApplicationEventName, PrincipalType, SignInRequest, SignUpRequest, SwitchPlatformRequest, TelemetryEventName, UserIdentityProvider } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { authAbuseRateLimitOptions } from '../core/security/rate-limit'
import { applicationEvents } from '../helper/application-events'
import { networkUtils } from '../helper/network-utils'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { telemetry } from '../helper/telemetry.utils'
import { platformUtils } from '../platform/platform.utils'
import { userService } from '../user/user-service'
import { authenticationService } from './authentication.service'
import { captchaVerifier } from './lib/captcha-verifier'
import { signInEmailThrottle } from './lib/sign-in-email-throttle'

export const authenticationController: FastifyPluginAsyncZod = async (
    app,
) => {
    app.post('/sign-up', SignUpRequestOptions, async (request) => {
        const { captchaToken, ...signUpRequest } = request.body
        const clientIp = networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER))
        await captchaVerifier(request.log).assertValidCaptcha({
            token: captchaToken,
            remoteIp: clientIp,
        })

        const platformId = await platformUtils.getPlatformIdForRequest(request)
        const signUpResponse = await authenticationService(request.log).signUp({
            ...signUpRequest,
            provider: UserIdentityProvider.EMAIL,
            platformId: platformId ?? null,
        })

        if (!isNil(signUpResponse.platformId)) {
            applicationEvents(request.log).sendUserEvent({
                platformId: signUpResponse.platformId,
                userId: signUpResponse.id,
                projectId: signUpResponse.projectId ?? undefined,
                ip: clientIp,
            }, {
                action: ApplicationEventName.USER_SIGNED_UP,
                data: {
                    source: 'credentials',
                },
            })
        }

        return signUpResponse
    })

    app.post('/sign-in', SignInRequestOptions, async (request) => {
        const { email, password } = request.body

        await signInEmailThrottle(request.log).assertNotThrottled({ email })

        const predefinedPlatformId = await platformUtils.getPlatformIdForRequest(request)
        const { data: response, error: signInError } = await tryCatch(() => authenticationService(request.log).signInWithPassword({
            email,
            password,
            predefinedPlatformId,
        }))

        if (signInError !== null) {
            if (signInError instanceof ActivepiecesError && signInError.error.code === ErrorCode.INVALID_CREDENTIALS) {
                await signInEmailThrottle(request.log).recordFailedAttempt({ email })
            }
            throw signInError
        }
        await signInEmailThrottle(request.log).clearAttempts({ email })

        if (!isNil(response.platformId)) {
            applicationEvents(request.log).sendUserEvent({
                platformId: response.platformId,
                userId: response.id,
                projectId: response.projectId ?? undefined,
                ip: networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
            }, {
                action: ApplicationEventName.USER_SIGNED_IN,
                data: {},
            })
            rejectedPromiseHandler(telemetry(request.log).trackUser(response.id, {
                name: TelemetryEventName.SIGNED_IN,
                payload: {
                    userId: response.id,
                    platformId: response.platformId,
                },
            }, { platform: response.platformId }), request.log)
        }

        return response
    })

    app.post('/switch-platform', SwitchPlatformRequestOptions, async (request) => {
        const user = await userService(request.log).getOneOrFail({ id: request.principal.id })
        return authenticationService(request.log).switchPlatform({
            identityId: user.identityId,
            platformId: request.body.platformId,
        })
    })

}

const rateLimitOptions: RateLimitOptions = {
    max: Number.parseInt(
        system.getOrThrow(AppSystemProp.API_RATE_LIMIT_AUTHN_MAX),
        10,
    ),
    timeWindow: system.getOrThrow(AppSystemProp.API_RATE_LIMIT_AUTHN_WINDOW),
}



const SwitchPlatformRequestOptions = {
    config: {
        security: securityAccess.publicPlatform([PrincipalType.USER]),
        rateLimit: rateLimitOptions,
    },
    schema: {
        body: SwitchPlatformRequest,
    },
}

const SignUpRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: authAbuseRateLimitOptions,
    },
    schema: {
        body: SignUpRequest,
    },
}

const SignInRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: authAbuseRateLimitOptions,
    },
    schema: {
        body: SignInRequest,
    },
}
