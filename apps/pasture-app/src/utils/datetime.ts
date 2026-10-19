function pad2(value: number) {
  return String(value).padStart(2, '0')
}

// Format a timestamp as HH:mm.
// The uni-app APP/H5 runtime does not always honour toLocaleTimeString options,
// so the string is built manually to keep the mobile display short.
export function formatClockTime(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : ''
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}
