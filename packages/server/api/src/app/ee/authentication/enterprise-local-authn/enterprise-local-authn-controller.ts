import {
    ResetPasswordRequestBody,
    VerifyEmailRequestBody } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { authAbuseRateLimitOptions } from '../../../core/security/rate-limit'
import { enterpriseLocalAuthnService } from './enterprise-local-authn-service'

export const enterpriseLocalAuthnController: FastifyPluginAsyncZod = async (
    app,
) => {
    app.post('/verify-email', VerifyEmailRequest, async (req) => {
        await enterpriseLocalAuthnService(req.log).verifyEmail(req.body)
    })

    app.post('/reset-password', ResetPasswordRequest, async (req) => {
        await enterpriseLocalAuthnService(req.log).resetPassword(req.body)
    })
}

// Both endpoints take a guessable identityId + a 6-digit-class OTP in the body —
// same tighter tier as sign-up/sign-in (see core/security/rate-limit.ts) so brute
// forcing the OTP itself is bounded per IP, on top of the OTP's own 10-minute expiry.
const VerifyEmailRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authAbuseRateLimitOptions,
    },
    schema: {
        body: VerifyEmailRequestBody,
    },
}

const ResetPasswordRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authAbuseRateLimitOptions,
    },
    schema: {
        body: ResetPasswordRequestBody,
    },
}