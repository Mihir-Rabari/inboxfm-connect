import { PlatformApiKey, PlatformApiKeyWithValue, PlatformWithPlan, Project, ProjectApiKey, ProjectApiKeyWithValue, User } from '@/lib/api/types'

export function testProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj_default',
    displayName: 'InboxFM Main Project',
    platformId: 'platform_1',
    ...overrides,
  }
}

export function testUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    email: 'admin@inboxfm.local',
    firstName: 'Ada',
    lastName: 'Admin',
    platformRole: 'ADMIN',
    ...overrides,
  }
}

export function projectApiKey(overrides: Partial<ProjectApiKey> = {}): ProjectApiKey {
  return {
    id: 'cak_1',
    created: '2026-01-10T10:00:00.000Z',
    displayName: 'Production backend',
    platformId: 'platform_1',
    projectId: 'proj_default',
    truncatedValue: 'ab12',
    lastUsedAt: '2026-02-01T10:00:00.000Z',
    ...overrides,
  }
}

export function projectApiKeyWithValue(overrides: Partial<ProjectApiKeyWithValue> = {}): ProjectApiKeyWithValue {
  return {
    ...projectApiKey(),
    value: 'cak-testvalue1234567890',
    ...overrides,
  }
}

export function platformApiKey(overrides: Partial<PlatformApiKey> = {}): PlatformApiKey {
  return {
    id: 'sk_1',
    created: '2026-01-05T10:00:00.000Z',
    displayName: 'CI service key',
    platformId: 'platform_1',
    truncatedValue: 'cd34',
    lastUsedAt: null,
    ...overrides,
  }
}

export function platformApiKeyWithValue(overrides: Partial<PlatformApiKeyWithValue> = {}): PlatformApiKeyWithValue {
  return {
    ...platformApiKey(),
    value: 'sk-testvalue1234567890',
    ...overrides,
  }
}

export function platformWithPlan(overrides: Partial<PlatformWithPlan> = {}): PlatformWithPlan {
  return {
    id: 'platform_1',
    plan: { apiKeysEnabled: true },
    ...overrides,
  }
}
