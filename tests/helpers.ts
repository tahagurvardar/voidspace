import { createDatabase, setDbForTesting, type VoidspaceDB } from '@/lib/storage/db';

let counter = 0;

/** A fresh, uniquely named IndexedDB (fake-indexeddb) installed as the app singleton. */
export async function freshDb(): Promise<VoidspaceDB> {
  counter += 1;
  const db = createDatabase(`voidspace-test-${counter}-${Math.random().toString(36).slice(2)}`);
  await db.open();
  setDbForTesting(db);
  return db;
}

/** A no-op CanvasRenderingContext2D good enough for render loops. */
export function stubCanvas2D(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  return new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
