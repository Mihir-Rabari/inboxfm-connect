import { describe, expect, it } from 'vitest'
import { TriggerBinding, TriggerBindingStatus } from '../../src/lib/execution/trigger-binding'

describe('TriggerBinding Model & Contract', () => {
    it('validates a valid TriggerBinding', () => {
        const binding = {
            id: 'tb_12345678901234567',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            projectId: 'proj_12345678901234567',
            platformId: 'plat_12345678901234567',
            pieceName: '@inboxfm-connect/piece-slack',
            pieceVersion: '0.1.0',
            triggerName: 'new_message',
            connectionId: 'conn_12345678901234567',
            promptTemplate: 'Summarize the Slack message: {{item.text}}',
            settings: {
                channel: 'C123456',
            },
            status: TriggerBindingStatus.ENABLED,
        }

        const parsed = TriggerBinding.parse(binding)
        expect(parsed.id).toBe('tb_12345678901234567')
        expect(parsed.status).toBe(TriggerBindingStatus.ENABLED)
    })

    it('rejects forbidden workflow graph fields from TriggerBinding contract', () => {
        const forbiddenFields = [
            'flowId',
            'flowVersionId',
            'stepName',
            'nodeId',
            'routerPath',
            'loopIteration',
        ]

        const bindingKeys = Object.keys(TriggerBinding.shape)
        for (const forbidden of forbiddenFields) {
            expect(bindingKeys).not.toContain(forbidden)
        }
    })
})
