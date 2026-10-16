import { expect, test, type Page } from '@playwright/test';

/** Collects console errors and uncaught exceptions for the whole test. */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const thoughtField = (page: Page) => page.getByLabel("What's on your mind?");

test('primary button text meets AA contrast in normal and hover states', async ({ page }) => {
  await page.goto('/#focus');
  const button = page.getByRole('button', { name: 'Start', exact: true });
  await expect(button).toBeEnabled();
  for (const state of ['normal', 'hover']) {
    if (state === 'hover') await button.hover();
    const ratios = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      const luminance = (rgb: string) => {
        const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
      };
      const foreground = luminance(style.color);
      const stops = style.backgroundImage.match(/rgb\([^)]+\)/g);
      if (!stops || stops.length !== 2) throw new Error('Expected a two-stop opaque RGB gradient');
      return stops.map((stop) => {
        const background = luminance(stop);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
    });
    for (const ratio of ratios) expect(ratio, `${state} gradient stop contrast`).toBeGreaterThanOrEqual(4.5);
  }
});

test.describe('start screen & navigation', () => {
  test('settings traps focus, restores it, and remembers the single-key shortcut opt-out', async ({ page }) => {
    await page.goto('/');
    const settings = page.getByRole('button', { name: 'Settings', exact: true });
    await settings.click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    const shortcuts = dialog.getByRole('checkbox', { name: 'Enable single-key mode shortcuts (1–4)' });
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    // Native dialogs can visit browser chrome before cycling back into the modal.
    // Background document controls must never receive focus.
    if (!(await page.evaluate(() => document.hasFocus()))) await page.keyboard.press('Shift+Tab');
    await expect(shortcuts).toBeFocused();
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => document.hasFocus()))) await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await shortcuts.uncheck();
    await expect(shortcuts).not.toBeChecked();
    await close.click();
    await expect(settings).toBeFocused();
    await page.reload();
    await settings.click();
    await expect(shortcuts).not.toBeChecked();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(settings).toBeFocused();
    await page.keyboard.press('1');
    await expect(page.getByRole('heading', { level: 1, name: 'Make room for your mind.' })).toBeVisible();
    await page.getByTestId('nav-focus').click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { level: 1, name: 'Make room for your mind.' })).toBeVisible();
  });

  test('communicates the three modes immediately, without errors', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Make room for your mind.' })).toBeVisible();
    for (const id of ['clear', 'focus', 'explore']) await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
    await expect(page.getByTestId('core-anchor')).toBeVisible();
    await expect(page.getByTestId('nav-clear')).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('switches modes on the single route; back button returns', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-focus').click();
    await expect(page.getByRole('heading', { level: 1, name: 'One thing, for a set time.' })).toBeVisible();
    await expect(page).toHaveURL(/\/#focus$/);
    await page.getByTestId('nav-explore').click();
    await expect(page.getByRole('heading', { level: 1, name: /short break/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'One thing, for a set time.' })).toBeVisible();
  });

  test('is operable with the keyboard alone', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab'); // skip link
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    // Reach the Clear card by tabbing.
    for (let i = 0; i < 12; i++) {
      if (await page.getByTestId('nav-clear').evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(page.getByTestId('nav-clear')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: /Put it somewhere safe/ })).toBeFocused();
    await page.keyboard.press('2');
    await expect(page.getByRole('heading', { level: 1, name: 'One thing, for a set time.' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { level: 1, name: 'Make room for your mind.' })).toBeVisible();
  });

  test('the start screen fits the viewport without scrolling', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Make room for your mind.' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator('main').evaluate((m) => m.scrollHeight - m.clientHeight)).toBeLessThanOrEqual(0);
  });

  test('has no horizontal overflow at this viewport', async ({ page }) => {
    const modes = [
      ['', 'Make room for your mind.'],
      ['#clear', 'Put it somewhere safe, or let it go.'],
      ['#focus', 'One thing, for a set time.'],
      ['#explore', 'A short break for your hands and eyes.'],
      ['#archive', 'Everything you chose to keep.'],
    ];
    for (const [hash, heading] of modes) {
      await page.goto(`/${hash}`);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      if (hash === '#explore') await expect(page.getByTestId('orbit-canvas')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(
        () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        { message: `overflow on ${hash || 'home'}` },
      ).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('clear & archive persistence', () => {
  test('a saved thought survives a reload and appears in the archive', async ({ page }) => {
    await page.goto('/#clear');
    await thoughtField(page).fill('Remember to water the plants');
    await page.locator('label', { hasText: /^Task$/ }).click();
    await expect(page.getByRole('radio', { name: 'Task' })).toBeChecked();
    await page.getByRole('button', { name: 'Save thought' }).click();
    await expect(page.getByRole('list', { name: 'Saved thoughts' }).getByText('Remember to water the plants')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('list', { name: 'Saved thoughts' }).getByText('Remember to water the plants')).toBeVisible();

    await page.getByRole('button', { name: 'Archive' }).click();
    const star = page.getByRole('button', { name: /Task: Remember to water the plants/ });
    await expect(star).toBeVisible();
    await star.click();
    const selected = page.getByTestId('selected-thought');
    await expect(selected).toContainText('Remember to water the plants');
    // The selected note and its actions end above the bottom navigation.
    await expect(selected.getByRole('button', { name: 'Delete' })).toBeInViewport();
    await expect
      .poll(() => selected.evaluate((note) => {
        const nav = document.querySelector('nav[aria-label="Modes"]');
        if (!nav) throw new Error('Mode navigation is missing');
        return note.getBoundingClientRect().bottom - nav.getBoundingClientRect().top;
      }))
      .toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByRole('list', { name: 'Archived thoughts' }).getByText('Remember to water the plants')).toBeVisible();
  });

  test('a released thought is never stored', async ({ page }) => {
    await page.goto('/#clear');
    await thoughtField(page).fill('This should vanish');
    await page.getByRole('button', { name: 'Release' }).click();
    await expect(thoughtField(page)).toHaveValue('');
    await page.reload();
    await expect(page.getByText('Nothing saved yet.', { exact: false })).toBeVisible();
    const stored = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open('voidspace');
          req.onerror = () => reject(req.error);
          req.onblocked = () => reject(new Error('Opening the thoughts database was blocked'));
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction('thoughts', 'readonly');
              const count = tx.objectStore('thoughts').count();
              tx.oncomplete = () => {
                db.close();
                resolve(count.result);
              };
              tx.onabort = () => {
                db.close();
                reject(tx.error ?? new Error('Counting thoughts was aborted'));
              };
            } catch (error) {
              db.close();
              reject(error);
            }
          };
        }),
    );
    expect(stored).toBe(0);
  });

  test('edit and delete a thought', async ({ page }) => {
    await page.goto('/#clear');
    await thoughtField(page).fill('Draft text');
    await page.getByRole('button', { name: 'Save thought' }).click();
    await page.getByRole('button', { name: /Edit thought: Draft text/ }).click();
    await page.getByLabel('Edit thought').fill('Edited text');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Edited text')).toBeVisible();
    await page.getByRole('button', { name: /Delete thought: Edited text/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete thought' }).click();
    await expect(page.getByText('Edited text')).toHaveCount(0);
  });
});

test.describe('focus timer', () => {
  test('synchronizes start, pause, resume and reset between tabs', async ({ page, context }) => {
    // Both tabs share this fixed wall clock; slow CI cannot cross the reset-confirmation threshold.
    // Timers and storage events still run normally (elapsed-time behavior has separate tests).
    await page.clock.setFixedTime(new Date('2026-10-16T09:00:00Z'));
    const other = await context.newPage();
    // Keep two software-rendered WebGL scenes from competing in this storage-sync test.
    // The dedicated WebGL test still requires a rendered frame with full motion.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await other.emulateMedia({ reducedMotion: 'reduce' });
    const errors = trackErrors(page);
    const otherErrors = trackErrors(other);
    try {
      await page.goto('/#focus');
      await other.goto('/#focus');
      await expect(other.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '15 min' }).click();
      await expect(other.getByTestId('focus-remaining')).toHaveText('15:00');
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      await expect(page.getByTestId('focus-status')).toContainText('Focusing');
      await expect(other.getByTestId('focus-status')).toContainText('Focusing');
      await other.getByRole('button', { name: 'Pause', exact: true }).click();
      await expect(page.getByTestId('focus-status')).toContainText('Paused');
      await expect(page.getByTestId('focus-remaining')).toHaveText(await other.getByTestId('focus-remaining').innerText());
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(other.getByTestId('focus-status')).toContainText('Focusing');
      await other.getByRole('button', { name: 'Reset', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
      await expect(page.getByTestId('focus-remaining')).toHaveText('15:00');
      expect(errors).toEqual([]);
      expect(otherErrors).toEqual([]);
    } finally {
      await other.close();
    }
  });

  test('start, pause and resume reflect real elapsed time; a reload keeps the session', async ({ page }) => {
    // A paused fake clock + fastForward gives exact, deterministic time. (runFor would
    // fire every intermediate interval tick and flood React's scheduler.)
    await page.clock.install({ time: new Date('2026-10-16T09:00:00') });
    await page.goto('/#focus');
    // Pause relative to the page's current (fake) time: page load can take seconds
    // under load, and pausing at a fixed instant could then point into the past.
    const pageNow = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(pageNow + 60_000);
    const remaining = page.getByTestId('focus-remaining');
    await page.getByRole('button', { name: '15 min' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.clock.fastForward(65_000);
    await expect(remaining).toHaveText('13:55');
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.clock.fastForward(120_000);
    await expect(remaining).toHaveText('13:55'); // paused time does not count
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.clock.fastForward(5_000);
    await expect(remaining).toHaveText('13:50');
    await page.reload();
    await expect(page.getByTestId('focus-status')).toContainText('Focusing');
    await expect(remaining).toHaveText('13:50'); // the session survives the reload exactly
    await page.clock.fastForward(10_000);
    await expect(remaining).toHaveText('13:40');
  });

  test('completes after the planned time even without ticks, and records it', async ({ page }) => {
    await page.clock.install();
    await page.goto('/#focus');
    await page.getByRole('button', { name: '15 min' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    // Jump the clock without running intermediate timers (like a suspended background tab).
    await page.clock.fastForward('15:01');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByTestId('focus-status')).toHaveText('Complete');
    await expect(page.getByTestId('stat-count')).toHaveText('1');
    await expect(page.getByTestId('stat-total')).toHaveText('15 min');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByTestId('session-item').first()).toContainText('Completed');
  });
});

test.describe('explore', () => {
  test('Orbit Lab and Echo Waves respond to pointer input and reset', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/#explore');
    const orbit = page.getByTestId('orbit-canvas');
    await expect(orbit).toBeVisible();
    const box = (await orbit.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Repel' }).click();
    await page.getByRole('tabpanel').getByRole('button', { name: 'Reset', exact: true }).click();

    await page.getByRole('tab', { name: 'Echo Waves' }).click();
    const echo = page.getByTestId('echo-canvas');
    await expect(page.getByText('Tap anywhere to send a wave.')).toBeVisible();
    await echo.click({ position: { x: 60, y: 60 } });
    await echo.click({ position: { x: 140, y: 80 } });
    await expect(page.getByText('Tap anywhere to send a wave.')).toBeHidden();
    await page.getByRole('tabpanel').getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByText('Tap anywhere to send a wave.')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('graceful degradation', () => {
  test('uses the WebGL core when available', async ({ page }) => {
    await page.goto('/');
    const anchor = page.getByTestId('core-anchor');
    await expect(anchor).toHaveAttribute('data-render-mode', 'webgl');
    // The scene has drawn a frame (three.js is lazy-loaded; software GL can be slow).
    await expect(anchor).toHaveAttribute('data-webgl-ready', 'true', { timeout: 20_000 });
    await expect(page.locator('canvas')).toHaveCount(1);
    // Once drawing, the CSS orb fades out underneath.
    await expect(page.getByTestId('core-fallback').locator('..')).toHaveClass(/opacity-0/);
  });

  test('falls back to the static core without WebGL and stays fully functional', async ({ page }) => {
    await page.addInitScript(() => {
      const proto = HTMLCanvasElement.prototype as unknown as {
        getContext: (this: HTMLCanvasElement, type: string, ...rest: unknown[]) => unknown;
      };
      const original = proto.getContext;
      proto.getContext = function (type, ...rest) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return original.call(this, type, ...rest);
      };
    });
    await page.goto('/');
    await expect(page.getByTestId('core-anchor')).toHaveAttribute('data-render-mode', 'static');
    await expect(page.getByTestId('core-fallback')).toBeVisible();
    await page.getByTestId('nav-clear').click();
    await thoughtField(page).fill('Works without WebGL');
    await page.getByRole('button', { name: 'Save thought' }).click();
    await expect(page.getByRole('list', { name: 'Saved thoughts' }).getByText('Works without WebGL')).toBeVisible();
  });

  test('reduced motion shows the still core', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('core-anchor')).toHaveAttribute('data-render-mode', 'static');
    await expect(page.locator('[data-reduced-motion="true"]')).toHaveCount(1);
  });
});

test.describe('data', () => {
  test('export produces a versioned backup and delete-all clears data', async ({ page }) => {
    await page.goto('/#clear');
    await thoughtField(page).fill('Backed up thought');
    await page.getByRole('button', { name: 'Save thought' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^voidspace-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const text = await (await file.createReadStream()).toArray();
    const json = JSON.parse(Buffer.concat(text).toString('utf8'));
    expect(json).toMatchObject({ app: 'voidspace', formatVersion: 1 });
    expect(json.data.thoughts[0].content).toBe('Backed up thought');

    await page.getByRole('button', { name: 'Delete all data…' }).click();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Nothing saved yet.', { exact: false })).toBeVisible();
  });

  test('import shows a preview and restores thoughts', async ({ page }) => {
    await page.goto('/#archive');
    await page.getByRole('button', { name: 'Settings' }).click();
    const backup = {
      app: 'voidspace',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        thoughts: [{ id: 'imported-1', content: 'From a backup', category: 'idea', createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000 }],
        focusSessions: [],
      },
    };
    await page.getByLabel('Import backup').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByTestId('import-plan')).toContainText('1 thoughts (1 new');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: /Idea: From a backup/ })).toBeVisible();
  });

  test('rejects an invalid backup and preserves saved thoughts after reload', async ({ page }) => {
    await page.goto('/#clear');
    const savedThoughts = page.getByRole('list', { name: 'Saved thoughts' });
    await thoughtField(page).fill('Keep this thought');
    await page.getByRole('button', { name: 'Save thought' }).click();
    await expect(savedThoughts.getByText('Keep this thought', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Import backup').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"app":"voidspace","formatVersion":1,"data":{"thoughts":[{"id":"x"}]}}'),
    });
    await expect(page.getByRole('alert').filter({ hasText: 'invalid data' })).toBeVisible();
    await expect(page.getByTestId('import-plan')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.reload();
    await expect(savedThoughts.getByText('Keep this thought', { exact: true })).toBeVisible();
    await expect(savedThoughts.getByRole('listitem')).toHaveCount(1);
  });
});
