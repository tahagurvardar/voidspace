/** Generates a random, URL-safe identifier. Never derived from user content. */
export function createId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Last resort for exotic environments; uniqueness is still overwhelmingly likely.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
