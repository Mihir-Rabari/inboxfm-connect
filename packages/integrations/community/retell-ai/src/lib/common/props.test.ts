import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpMethod } from '@inboxfm-connect/pieces-common';
import { agentIdDropdown } from './props';
import * as clientModule from './client';

/**
 * Issue #477 — Retell removed `GET /list-agents` on 2026-07-31. The replacement is
 * the unified `POST /v2/list-agents`, which has three properties this pins:
 *
 *  - `limit` is a QUERY parameter; the v2 body schema documents only `filter_criteria`
 *  - v2 serves voice *and* chat agents, so `filter_criteria.channel` must be sent to
 *    preserve the old voice-only dropdown
 *  - the response is the `{ items, has_more, pagination_key }` envelope, never a
 *    top-level array
 *
 * The mocks below use the documented envelope so the suite exercises the shape
 * production actually receives.
 */

const AGENT = {
  agent_id: 'agent_123',
  agent_name: 'Customer Support Bot',
  version: 1,
  is_published: true,
  voice_id: 'voice_1',
};

const mockAgents = (response: unknown) =>
  vi.spyOn(clientModule, 'retellAiApiCall').mockResolvedValue(response as never);

const runDropdown = async (response: unknown) => {
  mockAgents(response);
  const dropdown = agentIdDropdown('Agent');
  return dropdown.options({ auth: 'retell_api_key' as never }, {} as never);
};

describe('agentIdDropdown (Issue #477)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to the v2 endpoint with limit on the query string and the voice channel filter', async () => {
    const apiSpy = mockAgents({ items: [AGENT], has_more: false });

    const dropdown = agentIdDropdown('Agent');
    await dropdown.options({ auth: 'retell_api_key' as never }, {} as never);

    expect(apiSpy).toHaveBeenCalledWith({
      auth: 'retell_api_key',
      method: HttpMethod.POST,
      url: '/v2/list-agents?limit=100',
      body: {
        filter_criteria: {
          channel: {
            type: 'string',
            op: 'eq',
            value: 'voice',
          },
        },
      },
    });
  });

  it('never sends limit in the request body', async () => {
    const apiSpy = mockAgents({ items: [AGENT] });

    const dropdown = agentIdDropdown('Agent');
    await dropdown.options({ auth: 'retell_api_key' as never }, {} as never);

    const body = apiSpy.mock.calls[0][0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty('limit');
  });

  it('maps the documented items envelope into dropdown options', async () => {
    const result = await runDropdown({
      items: [AGENT],
      has_more: false,
      pagination_key: 'agent_123abc',
    });

    expect(result).toEqual({
      disabled: false,
      options: [
        {
          label: 'Customer Support Bot (agent_123)',
          value: 'agent_123',
        },
      ],
    });
  });

  it('disables the dropdown with a placeholder when the workspace has no agents', async () => {
    const result = await runDropdown({ items: [], has_more: false });

    expect(result).toEqual({
      disabled: true,
      options: [],
      placeholder: 'No agents found in your workspace.',
    });
  });

  it('does not crash on a malformed envelope', async () => {
    const result = await runDropdown({ has_more: false });

    expect(result).toEqual({
      disabled: true,
      options: [],
      placeholder: 'No agents found in your workspace.',
    });
  });

  it('disables without calling the API when auth is missing', async () => {
    const apiSpy = vi.spyOn(clientModule, 'retellAiApiCall');

    const dropdown = agentIdDropdown('Agent');
    const result = await dropdown.options({} as never, {} as never);

    expect(apiSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      disabled: true,
      options: [],
      placeholder: 'Connect your Retell AI account first',
    });
  });
});