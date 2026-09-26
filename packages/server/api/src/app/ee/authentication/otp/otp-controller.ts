import { CreateOtpRequestBody } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { authAbuseRateLimitOptions } from '../../../core/security/rate-limit'
import { platformUtils } from '../../../platform/platform.utils'
import { otpService } from './otp-service'

export const otpController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreateOtpRequest, async (req, res) => {
        const platformId = await platformUtils.getPlatformIdForRequest(req)
        await otpService(req.log).createAndSend({
            platformId,
            email: req.body.email,
            type: req.body.type,
        })
        return res.code(StatusCodes.NO_CONTENT).send()
    })
}

const CreateOtpRequest = {
    config: {
        security: securityAccess.public(),
        // This is the "request a password reset / verification code" entrypoint —
        // same tighter tier as sign-up/sign-in (see core/security/rate-limit.ts),
        // since spamming it emails the target inbox on every request.
        rateLimit: authAbuseRateLimitOptions,
    },
    schema: {
        body: CreateOtpRequestBody,
    },
}
