import { ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { AuthPropertyRenderer } from '@/components/connections/auth-property-renderer'
import { ConnectionFormShell } from '@/components/connections/connection-form-shell'
import { TextField } from '@/components/connections/form-field'
import {
  AppConnection,
  OAuth2AuthorizationUrlResponse,
  PieceAuthMetadata,
  PieceMetadata,
} from '@/lib/api/types'
import { useConnectionCreated } from '@/lib/hooks/use-connection-created'
import {
  useCreateConnection,
  useCreateOAuthAuthorizationUrl,
} from '@/lib/query/hooks'
import { connectionErrors } from '@/lib/utils/connection-errors'
import { connectionIds } from '@/lib/utils/connection-ids'

const OAUTH_POPUP_NAME = 'inboxfm-oauth-popup'
const OAUTH_POPUP_FEATURES = 'width=600,height=720,left=100,top=100'
const POPUP_POLL_INTERVAL_MS = 500

type Phase = 'form' | 'authorizing' | 'creating'

interface OAuthFormValues {
  displayName: string
  clientId: string
  clientSecret: string
  props: Record<string, unknown>
}

interface OpenAuthorizationHandlers {
  onCode: (code: string) => void
  onCancelled: () => void
}

function buildRedirectUrl(): string {
  return `${window.location.origin}/redirect`
}

/**
 * Opens the authorization URL in a popup. The backend `/redirect` handshake
 * page posts `{ code }` to its opener once the provider returns. Returns a
 * silent cleanup function.
 */
function openAuthorizationWindow(
  authorizationUrl: string,
  handlers: OpenAuthorizationHandlers
): () => void {
  const popup = window.open(authorizationUrl, OAUTH_POPUP_NAME, OAUTH_POPUP_FEATURES)
  if (!popup) {
    handlers.onCancelled()
    return () => undefined
  }

  let settled = false

  const settle = () => {
    if (settled) return
    settled = true
    window.clearInterval(pollId)
    window.removeEventListener('message', onMessage)
  }

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    if (event.source !== popup) return
    const data = event.data as { code?: unknown } | null
    const code = typeof data?.code === 'string' ? data.code : undefined
    if (!code) return
    settle()
    handlers.onCode(code)
  }

  const pollId = window.setInterval(() => {
    if (!popup.closed) return
    window.clearInterval(pollId)
    // Wait briefly in case the message arrives just before the window closes.
    window.setTimeout(() => {
      if (settled) return
      settle()
      handlers.onCancelled()
    }, 200)
  }, POPUP_POLL_INTERVAL_MS)

  window.addEventListener('message', onMessage)

  return () => {
    settled = true
    window.clearInterval(pollId)
    window.removeEventListener('message', onMessage)
  }
}

interface OAuthConnectProps {
  piece: PieceMetadata
  auth: PieceAuthMetadata
  externalId?: string
  defaultDisplayName?: string
  isReconnect?: boolean
}

export function OAuthConnect({
  piece,
  auth,
  externalId,
  defaultDisplayName,
  isReconnect = false,
}: OAuthConnectProps) {
  const createAuthorizationUrl = useCreateOAuthAuthorizationUrl()
  const createConnection = useCreateConnection()
  const { handleConnectionCreated } = useConnectionCreated(piece.name)

  const [phase, setPhase] = useState<Phase>('form')
  const [serverError, setServerError] = useState<string | undefined>(undefined)
  const cleanupPopupRef = useRef<(() => void) | null>(null)

  const propEntries = Object.entries(auth.props ?? {})
  const hasProps = propEntries.length > 0

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OAuthFormValues>({
    defaultValues: {
      displayName: defaultDisplayName ?? `${piece.displayName} connection`,
      clientId: '',
      clientSecret: '',
      props: Object.fromEntries(propEntries.map(([key, prop]) => [key, prop.defaultValue ?? ''])),
    },
  })

  useEffect(
    () => () => {
      cleanupPopupRef.current?.()
    },
    []
  )

  const pending = phase !== 'form' || createAuthorizationUrl.isPending || createConnection.isPending

  const handleContinue = handleSubmit(async (values) => {
    setServerError(undefined)
    setPhase('authorizing')

    let authorization: OAuth2AuthorizationUrlResponse
    try {
      authorization = await createAuthorizationUrl.mutateAsync({
        pieceName: piece.name,
        pieceVersion: piece.version,
        clientId: values.clientId.trim(),
        redirectUrl: buildRedirectUrl(),
        props: hasProps ? values.props : undefined,
      })
    } catch (error) {
      setPhase('form')
      setServerError(
        connectionErrors.describe(error, 'Could not start the authorization flow. Try again.')
      )
      return
    }

    await new Promise<void>((resolve) => {
      cleanupPopupRef.current = openAuthorizationWindow(authorization.authorizationUrl, {
        onCode: async (code) => {
          cleanupPopupRef.current = null
          setPhase('creating')
          try {
            const connection: AppConnection = await createConnection.mutateAsync({
              displayName: values.displayName.trim(),
              pieceName: piece.name,
              pieceVersion: piece.version,
              type: 'OAUTH2',
              externalId: externalId ?? connectionIds.newExternalId(),
              value: {
                type: 'OAUTH2',
                client_id: values.clientId.trim(),
                client_secret: values.clientSecret,
                code,
                scope: (auth.scope ?? []).join(' '),
                redirect_url: buildRedirectUrl(),
                ...(authorization.codeVerifier
                  ? { code_challenge: authorization.codeVerifier }
                  : {}),
                ...(hasProps ? { props: values.props } : {}),
                ...(auth.authorizationMethod
                  ? { authorization_method: auth.authorizationMethod }
                  : {}),
              },
            })
            reset()
            handleConnectionCreated(connection.displayName)
          } catch (error) {
            setPhase('form')
            setServerError(
              connectionErrors.describe(
                error,
                'The provider rejected the authorization. Verify your client credentials and try again.'
              )
            )
          } finally {
            resolve()
          }
        },
        onCancelled: () => {
          cleanupPopupRef.current = null
          setPhase('form')
          setServerError(
            'The authorization window was closed before access was granted. No changes were made.'
          )
          resolve()
        },
      })
    })
  })

  const submitLabel =
    phase === 'authorizing'
      ? 'Starting authorization...'
      : phase === 'creating'
        ? 'Creating connection...'
        : isReconnect
          ? `Continue to ${piece.displayName} & Reconnect`
          : `Continue to ${piece.displayName}`

  return (
    <ConnectionFormShell
      pieceDisplayName={piece.displayName}
      pieceLogoUrl={piece.logoUrl}
      title={`Connect ${piece.displayName}`}
      description="A secure provider window will open where you authorize InboxFM Connect. Tokens are exchanged server-side and are never displayed."
      submitLabel={submitLabel}
      pending={pending}
      errorMessage={serverError}
      onSubmit={(event) => void handleContinue(event)}
    >
      {isReconnect && (
        <p className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          Reconnecting updates this existing account in place — tools keep using the same connection.
        </p>
      )}

      <Controller
        name="displayName"
        control={control}
        rules={{ required: 'Connection name is required' }}
        render={({ field }) => (
          <TextField
            id="oauth-display-name"
            label="Connection name"
            required
            value={field.value}
            onChange={field.onChange}
            disabled={pending}
            error={errors.displayName?.message}
            autoComplete="off"
          />
        )}
      />

      <Controller
        name="clientId"
        control={control}
        rules={{ required: 'Client ID is required' }}
        render={({ field }) => (
          <TextField
            id="oauth-client-id"
            label="Client ID"
            description={`The client ID of your ${piece.displayName} OAuth application.`}
            required
            value={field.value}
            onChange={field.onChange}
            disabled={pending}
            error={errors.clientId?.message}
            autoComplete="off"
          />
        )}
      />

      <Controller
        name="clientSecret"
        control={control}
        rules={{ required: 'Client secret is required' }}
        render={({ field }) => (
          <TextField
            id="oauth-client-secret"
            label="Client secret"
            description={`The client secret of your ${piece.displayName} OAuth application.`}
            required
            type="password"
            value={field.value}
            onChange={field.onChange}
            disabled={pending}
            error={errors.clientSecret?.message}
            autoComplete="new-password"
          />
        )}
      />

      {propEntries.map(([name, prop]) => (
        <Controller
          key={name}
          name={`props.${name}`}
          control={control}
          rules={{
            required: prop.required ? `${prop.displayName} is required` : false,
          }}
          render={({ field, fieldState }) => (
            <AuthPropertyRenderer
              name={name}
              property={prop}
              value={field.value ?? ''}
              onChange={field.onChange}
              error={fieldState.error?.message}
              disabled={pending}
            />
          )}
        />
      ))}

      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span>Permissions requested</span>
        </p>
        {(auth.scope ?? []).length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${piece.displayName} OAuth scopes`}>
            {auth.scope!.map((scope) => (
              <li
                key={scope}
                className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {scope}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            This integration does not declare specific scopes.
          </p>
        )}
      </div>
    </ConnectionFormShell>
  )
}
