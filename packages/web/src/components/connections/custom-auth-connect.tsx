import { Controller, useForm } from 'react-hook-form'
import { AuthPropertyRenderer } from '@/components/connections/auth-property-renderer'
import { ConnectionFormShell } from '@/components/connections/connection-form-shell'
import { TextField } from '@/components/connections/form-field'
import { AppConnection, PieceAuthMetadata, PieceMetadata } from '@/lib/api/types'
import { useConnectionCreated } from '@/lib/hooks/use-connection-created'
import { useCreateConnection } from '@/lib/query/hooks'
import { connectionErrors } from '@/lib/utils/connection-errors'
import { connectionIds } from '@/lib/utils/connection-ids'

interface CustomAuthValues {
  displayName: string
  props: Record<string, unknown>
}

interface CustomAuthConnectProps {
  piece: PieceMetadata
  auth: PieceAuthMetadata
  externalId?: string
  defaultDisplayName?: string
  isReconnect?: boolean
}

export function CustomAuthConnect({
  piece,
  auth,
  externalId,
  defaultDisplayName,
  isReconnect = false,
}: CustomAuthConnectProps) {
  const createConnection = useCreateConnection()
  const { handleConnectionCreated } = useConnectionCreated(piece.name)

  const propEntries = Object.entries(auth.props ?? {})

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomAuthValues>({
    defaultValues: {
      displayName: defaultDisplayName ?? `${piece.displayName} connection`,
      props: Object.fromEntries(propEntries.map(([key, prop]) => [key, prop.defaultValue ?? ''])),
    },
  })

  const handleCreate = handleSubmit(async (values) => {
    try {
      const connection: AppConnection = await createConnection.mutateAsync({
        displayName: values.displayName.trim(),
        pieceName: piece.name,
        pieceVersion: piece.version,
        type: 'CUSTOM_AUTH',
        externalId: externalId ?? connectionIds.newExternalId(),
        value: {
          type: 'CUSTOM_AUTH',
          props: values.props,
        },
      })
      reset({ displayName: values.displayName, props: values.props })
      handleConnectionCreated(connection.displayName)
    } catch {
      // Surfaced through the mutation's error state below.
    }
  })

  return (
    <ConnectionFormShell
      pieceDisplayName={piece.displayName}
      pieceLogoUrl={piece.logoUrl}
      title={`Connect ${piece.displayName}`}
      description={
        auth.description?.trim() ||
        `Provide the authentication details this integration requires. They are stored encrypted and never displayed again.`
      }
      submitLabel={isReconnect ? 'Reconnect' : 'Create connection'}
      pending={createConnection.isPending}
      errorMessage={
        createConnection.error
          ? connectionErrors.describe(
              createConnection.error,
              'The connection could not be created. Try again.'
            )
          : undefined
      }
      onSubmit={(event) => void handleCreate(event)}
    >
      {isReconnect && (
        <p className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          Reconnecting replaces the stored credential in place — tools keep using the same connection.
        </p>
      )}
      <Controller
        name="displayName"
        control={control}
        rules={{ required: 'Connection name is required' }}
        render={({ field }) => (
          <TextField
            id="custom-display-name"
            label="Connection name"
            required
            value={field.value}
            onChange={field.onChange}
            disabled={createConnection.isPending}
            error={errors.displayName?.message}
            autoComplete="off"
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
              disabled={createConnection.isPending}
            />
          )}
        />
      ))}
    </ConnectionFormShell>
  )
}
