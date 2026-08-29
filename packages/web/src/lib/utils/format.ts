function titleFromEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
}

export const formatUtils = {
  titleFromEnum,
}
