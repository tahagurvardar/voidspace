import { describe, expect, it, vi } from 'vitest';
import { loadFocusSnapshot, saveFocusSnapshot } from '@/features/focus/snapshotStorage';
import { createIdle } from '@/features/focus/timerMachine';

describe('focus snapshot storage', () => {
  it('recovers a valid saved timer', () => {
    expect(saveFocusSnapshot(createIdle(900))).toBe(true);
    expect(loadFocusSnapshot()).toEqual(createIdle(900));
  });

  it('returns no snapshot when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    expect(loadFocusSnapshot()).toBeNull();
  });
});
