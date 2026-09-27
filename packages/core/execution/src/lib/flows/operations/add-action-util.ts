import dayjs from 'dayjs'
import { applyFunctionToValuesSync, extractMustacheTokens, isString } from '@inboxfm-connect/core-utils'
import { FlowAction } from '../actions/action'
import { FlowVersion } from '../flow-version'
import { flowStructureUtil } from '../util/flow-structure-util'


function mapToNewNames(flowVersion: FlowVersion, clonedActions: FlowAction[]): Record<string, string> {
    const existingNames = flowStructureUtil.getAllSteps(flowVersion.trigger)
        .map(step => step.name)

    const oldStepNames = clonedActions.flatMap(clonedAction => flowStructureUtil.getAllSteps(clonedAction).map(step => step.name))

    return oldStepNames.reduce((nameMap, oldName) => {
        const newName = flowStructureUtil.findUnusedName(existingNames)
        existingNames.push(newName)
        return { ...nameMap, [oldName]: newName }
    }, {} as Record<string, string>)
}

type ReplaceOldStepNameWithNewOneProps = {
    input: string
    oldStepName: string
    newStepName: string
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceOldStepNameWithNewOne({
    input,
    oldStepName,
    newStepName,
}: ReplaceOldStepNameWithNewOneProps): string {
    // Shared brace-counting tokenizer: unlike /{{(.*?)}}/g it does not stop at
    // the first `}}`, so mentions containing `}}` (string literals, nested
    // braces) keep their trailing step reference on duplicate/paste.
    const tokens = extractMustacheTokens(input)
    if (tokens.length === 0) {
        return input
    }
    const stepNamePattern = new RegExp(`\\b${escapeRegExp(oldStepName)}\\b`, 'g')
    let result = ''
    let cursor = 0
    for (const { token, inner, index } of tokens) {
        result += input.slice(cursor, index)
        result += `{{${inner.replaceAll(stepNamePattern, newStepName)}}}`
        cursor = index + token.length
    }
    return result + input.slice(cursor)
}


function clone(step: FlowAction, oldNameToNewName: Record<string, string>): FlowAction {
    step.displayName = `${step.displayName} Copy`
    step.name = oldNameToNewName[step.name]
    if ('input' in step.settings) {
        Object.keys(oldNameToNewName).forEach((oldName) => {
            const settings = step.settings as { input: unknown }
            settings.input = applyFunctionToValuesSync(
                settings.input,
                (value: unknown) => {
                    if (isString(value)) {
                        return replaceOldStepNameWithNewOne({
                            input: value,
                            oldStepName: oldName,
                            newStepName: oldNameToNewName[oldName],
                        })
                    }
                    return value
                },
            )
        })
    }
    if (step.settings.sampleData) {
        step.settings = {
            ...step.settings,
            sampleData: {},
        }
    }
    step.lastUpdatedDate = dayjs().toISOString()
    return step
}

export const addActionUtils = {
    mapToNewNames,
    clone,
}
