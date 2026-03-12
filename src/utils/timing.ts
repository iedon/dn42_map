export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let id: ReturnType<typeof setTimeout>
  return ((...args: any[]) => {
    clearTimeout(id)
    id = setTimeout(() => fn(...args), delay)
  }) as unknown as T
}

export function throttle<T extends (...args: any[]) => void>(fn: T, limit: number): T {
  let blocked = false
  return ((...args: any[]) => {
    if (!blocked) {
      fn(...args)
      blocked = true
      setTimeout(() => (blocked = false), limit)
    }
  }) as unknown as T
}
