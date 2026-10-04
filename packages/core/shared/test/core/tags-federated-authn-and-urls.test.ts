import { describe, expect, it } from 'vitest'
import {
    ThirdPartyAuthnProviderEnum,
    ThirdPartyAuthnProvidersToShowMap,
} from '../../src/lib/core/federated-authn/authn-provider-name'
import { feedbackUrl } from '../../src/lib/core/feedback-url'
import { supportUrl } from '../../src/lib/core/support-url'
import {
    DeleteTagRequest,
    ListTagsRequest,
    PieceTag,
    SetPieceTagsRequest,
    Tag,
    UpsertTagRequest,
} from '../../src/lib/core/tag'

describe('Tags, Federated Authn, and Core System URLs Contracts (#141)', () => {
    describe('Core system URLs', () => {
        it('exports official feedback and support portal endpoints', () => {
            expect(feedbackUrl).toBe('https://feedback.activepieces.com')
            expect(supportUrl).toBe('https://community.activepieces.com')
        })

        it('ensures URLs use secure HTTPS protocol and valid URL formatting', () => {
            expect(() => new URL(feedbackUrl)).not.toThrow()
            expect(() => new URL(supportUrl)).not.toThrow()
            expect(new URL(feedbackUrl).protocol).toBe('https:')
            expect(new URL(supportUrl).protocol).toBe('https:')
        })
    })

    describe('ThirdPartyAuthnProviderEnum and providers map contract', () => {
        it('exports google and saml provider enum values', () => {
            expect(ThirdPartyAuthnProviderEnum.GOOGLE).toBe('google')
            expect(ThirdPartyAuthnProviderEnum.SAML).toBe('saml')
        })

        it('satisfies ThirdPartyAuthnProvidersToShowMap type contract', () => {
            const providerVisibilityMap: ThirdPartyAuthnProvidersToShowMap = {
                [ThirdPartyAuthnProviderEnum.GOOGLE]: true,
                [ThirdPartyAuthnProviderEnum.SAML]: false,
            }
            expect(providerVisibilityMap.google).toBe(true)
            expect(providerVisibilityMap.saml).toBe(false)
        })
    })

    describe('Tag and PieceTag entity schemas', () => {
        it('validates Tag schema with base model attributes', () => {
            const now = new Date().toISOString()
            const tag = Tag.parse({
                id: 'tag_01',
                created: now,
                updated: now,
                platformId: 'plt_01',
                name: 'productivity',
            })
            expect(tag.id).toBe('tag_01')
            expect(tag.name).toBe('productivity')
            expect(tag.platformId).toBe('plt_01')
        })

        it('validates PieceTag schema mapping pieces to tags', () => {
            const now = new Date().toISOString()
            const pieceTag = PieceTag.parse({
                id: 'ptag_01',
                created: now,
                updated: now,
                pieceName: '@inboxfm-connect/piece-gmail',
                tagId: 'tag_01',
                platformId: 'plt_01',
            })
            expect(pieceTag.pieceName).toBe('@inboxfm-connect/piece-gmail')
            expect(pieceTag.tagId).toBe('tag_01')
        })
    })

    describe('Tag request schemas', () => {
        it('coerces and validates ListTagsRequest', () => {
            const parsed = ListTagsRequest.parse({
                limit: '25',
                cursor: 'cur_abc_123',
            })
            expect(parsed.limit).toBe(25)
            expect(parsed.cursor).toBe('cur_abc_123')
        })

        it('validates SetPieceTagsRequest with array of piece names and tags', () => {
            const request = SetPieceTagsRequest.parse({
                piecesName: ['@inboxfm-connect/piece-slack', '@inboxfm-connect/piece-discord'],
                tags: ['communication', 'chat'],
            })
            expect(request.piecesName.length).toBe(2)
            expect(request.tags.length).toBe(2)
        })

        it('validates UpsertTagRequest and DeleteTagRequest', () => {
            const upsert = UpsertTagRequest.parse({ name: 'marketing' })
            expect(upsert.name).toBe('marketing')

            const del = DeleteTagRequest.parse({ id: 'tag_to_delete' })
            expect(del.id).toBe('tag_to_delete')
        })
    })
})
