/** A storage failure translated into a message the interface can show. */
export class StorageError extends Error {
  readonly kind: 'quota' | 'unavailable' | 'validation' | 'unknown';

  constructor(kind: StorageError['kind'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
    this.kind = kind;
  }
}

function errorName(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const e = error as { name?: unknown; inner?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';
  // Dexie wraps native errors; look one level in.
  if (name.endsWith('AbortError') && e.inner) return errorName(e.inner) || name;
  return name;
}

/** Maps IndexedDB/Dexie failures to user-facing StorageErrors. */
export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const name = errorName(error);
  if (name.includes('QuotaExceeded')) {
    return new StorageError(
      'quota',
      'Your browser is out of storage space for VOIDSPACE. Export a backup, then delete old thoughts or free up disk space.',
      { cause: error },
    );
  }
  if (
    name.includes('MissingAPI') ||
    name.includes('InvalidState') ||
    name.includes('OpenFailed') ||
    name.includes('DatabaseClosed') ||
    name.includes('Security')
  ) {
    return new StorageError(
      'unavailable',
      'Browser storage is unavailable. Private browsing or strict privacy settings can block it — your changes cannot be saved right now.',
      { cause: error },
    );
  }
  return new StorageError('unknown', 'Saving failed. Try again; if it keeps happening, export a backup.', {
    cause: error,
  });
}

/** Runs a storage operation, rethrowing failures as StorageError. */
export async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (error) {
    throw toStorageError(error);
  }
}
