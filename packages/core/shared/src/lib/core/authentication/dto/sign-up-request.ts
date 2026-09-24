import { ApId, SAFE_STRING_PATTERN } from '@inboxfm-connect/core-utils'
import { z } from 'zod'
import { EmailType, PasswordType } from '../../user/user'

export const SignUpRequest = z.object({
    email: EmailType,
    password: PasswordType,
    firstName: z.string().regex(new RegExp(SAFE_STRING_PATTERN)),
    lastName: z.string().regex(new RegExp(SAFE_STRING_PATTERN)),
    trackEvents: z.boolean(),
    newsLetter: z.boolean(),
    // Only read when AP_CAPTCHA_PROVIDER is configured (off by default — see
    // captcha-verifier.ts); ignored otherwise, so existing callers are unaffected.
    captchaToken: z.string().optional(),
})

export type SignUpRequest = z.infer<typeof SignUpRequest>

export const SwitchPlatformRequest = z.object({
    platformId: ApId,
})

export type SwitchPlatformRequest = z.infer<typeof SwitchPlatformRequest>

