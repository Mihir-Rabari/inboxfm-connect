import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    CreateTemplateRequestBody,
    ListTemplatesRequestQuery,
    UpdateTemplateRequestBody,
} from '../../../src/lib/management/template/template.requests'
import {
    SharedTemplate,
    TableDataState,
    TableImportDataType,
    TableTemplate,
    Template,
    TemplateStatus,
    TemplateTag,
    TemplateType,
} from '../../../src/lib/management/template/template'

describe('Template Management Contracts and Schemas', () => {
    describe('Enums and Value Types', () => {
        it('defines expected TemplateType enum values', () => {
            expect(TemplateType.OFFICIAL).toBe('OFFICIAL')
            expect(TemplateType.SHARED).toBe('SHARED')
            expect(TemplateType.CUSTOM).toBe('CUSTOM')
        })

        it('defines expected TemplateStatus enum values', () => {
            expect(TemplateStatus.PUBLISHED).toBe('PUBLISHED')
            expect(TemplateStatus.ARCHIVED).toBe('ARCHIVED')
        })

        it('defines TableImportDataType enum values', () => {
            expect(TableImportDataType.CSV).toBe('CSV')
        })

        it('validates TemplateTag with 6-char hex color', () => {
            const valid = {
                title: 'Marketing',
                color: '#FF5733',
                icon: 'campaign',
            }
            const parsed = TemplateTag.parse(valid)
            expect(parsed.title).toBe('Marketing')
            expect(parsed.color).toBe('#FF5733')

            // Invalid non-hex color rejected
            expect(() => TemplateTag.parse({ title: 'Tag', color: 'red' })).toThrow()
        })
    })

    describe('Table Template and Data State Schemas', () => {
        it('validates TableDataState with CSV data rows', () => {
            const state = {
                type: TableImportDataType.CSV,
                rows: [
                    [
                        { fieldId: 'fld_1', value: 'Alice' },
                        { fieldId: 'fld_2', value: 'alice@example.com' },
                    ],
                ],
            }
            const parsed = TableDataState.parse(state)
            expect(parsed.type).toBe(TableImportDataType.CSV)
            expect(parsed.rows.length).toBe(1)
            expect(parsed.rows[0][0].value).toBe('Alice')
        })

        it('validates TableTemplate with fields and optional data', () => {
            const table = {
                name: 'Leads',
                externalId: 'tbl_leads_01',
                fields: [
                    {
                        name: 'Lead Name',
                        type: 'TEXT',
                        externalId: 'fld_name',
                    },
                    {
                        name: 'Status',
                        type: 'STATIC_DROPDOWN',
                        externalId: 'fld_status',
                        data: {
                            options: [{ value: 'New' }, { value: 'Contacted' }],
                        },
                    },
                ],
                status: null,
                trigger: null,
                data: null,
            }
            const parsed = TableTemplate.parse(table)
            expect(parsed.name).toBe('Leads')
            expect(parsed.fields.length).toBe(2)
            expect(parsed.fields[1].data?.options.length).toBe(2)
        })
    })

    describe('Template and SharedTemplate Schemas', () => {
        const fullTemplate = {
            id: apId(),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            name: 'Slack Notification On New GitHub Issue',
            type: TemplateType.OFFICIAL,
            summary: 'Send a Slack message when a new issue is opened',
            description: 'Full description of how the workflow operates',
            tags: [{ title: 'DevOps', color: '#123456' }],
            blogUrl: 'https://blog.example.com/github-to-slack',
            metadata: null,
            author: 'InboxFM Team',
            categories: ['Developer Tools', 'Communication'],
            pieces: ['github', 'slack'],
            platformId: null,
            status: TemplateStatus.PUBLISHED,
        }

        it('validates full Template model', () => {
            const parsed = Template.parse(fullTemplate)
            expect(parsed.name).toBe(fullTemplate.name)
            expect(parsed.type).toBe(TemplateType.OFFICIAL)
            expect(parsed.pieces).toEqual(['github', 'slack'])
            expect(parsed.platformId).toBeNull()
        })

        it('validates SharedTemplate omitting system identifiers', () => {
            const parsed = SharedTemplate.parse(fullTemplate)
            expect('id' in parsed).toBe(false)
            expect('platformId' in parsed).toBe(false)
            expect('created' in parsed).toBe(false)
            expect('updated' in parsed).toBe(false)
            expect(parsed.name).toBe(fullTemplate.name)
        })
    })

    describe('Template Request DTOs', () => {
        it('validates CreateTemplateRequestBody with required fields', () => {
            const req = {
                name: 'Welcome Email Automation',
                summary: 'Send welcome emails to new signups',
                description: 'Triggers on user created',
                author: 'Growth Team',
                categories: ['Marketing'],
                type: TemplateType.CUSTOM,
                metadata: null,
            }
            const parsed = CreateTemplateRequestBody.parse(req)
            expect(parsed.name).toBe('Welcome Email Automation')
            expect(parsed.type).toBe(TemplateType.CUSTOM)
        })

        it('validates UpdateTemplateRequestBody with partial fields', () => {
            const req = {
                summary: 'Updated summary',
                status: TemplateStatus.ARCHIVED,
            }
            const parsed = UpdateTemplateRequestBody.parse(req)
            expect(parsed.summary).toBe('Updated summary')
            expect(parsed.status).toBe(TemplateStatus.ARCHIVED)
            expect(parsed.name).toBeUndefined()
        })

        it('validates ListTemplatesRequestQuery with scalar and array params', () => {
            const query = {
                type: TemplateType.OFFICIAL,
                pieces: 'slack',
                tags: ['devops', 'security'],
                search: 'notification',
                category: 'Productivity',
            }
            const parsed = ListTemplatesRequestQuery.parse(query)
            expect(parsed.type).toBe(TemplateType.OFFICIAL)
            expect(parsed.pieces).toEqual(['slack'])
            expect(parsed.tags).toEqual(['devops', 'security'])
            expect(parsed.search).toBe('notification')
        })
    })
})
