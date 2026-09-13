import { AppConnectionType } from '@/lib/api/types'

function connectionTypeLabel(type: AppConnectionType | string): string {
  switch (type) {
    case 'OAUTH2':
      return 'OAuth 2.0'
    case 'SECRET_TEXT':
      return 'API Key'
    case 'BASIC_AUTH':
      return 'Basic Auth'
    case 'CUSTOM_AUTH':
      return 'Custom Auth'
    default:
      return type
  }
}

export const connectionFormat = {
  connectionTypeLabel,
}
