import type { AppMode } from '@/types';

/**
 * Pure-CSS rendition of the Living Core. Server-rendered, so the orb is visible on
 * first paint; it is also the permanent fallback when WebGL is unavailable, when
 * graphics are set to "Static", or when reduced motion is requested.
 */
export function CoreFallback({ mode, animate }: { mode: AppMode; animate: boolean }) {
  return (
    <div
      className="core-fallback absolute inset-0"
      data-mode={mode}
      data-animate={animate ? 'true' : 'false'}
      data-testid="core-fallback"
      aria-hidden="true"
    >
      <div className="core-halo" />
      <div className="absolute" style={{ inset: '23%' }}>
        <div className="core-orb" />
      </div>
      <div
        className="core-ring core-ring-a"
        style={{ width: '94.6%', height: '41%', transform: 'translate(-50%, -50%) rotate(39deg)', opacity: 0.6 }}
      />
      <div
        className="core-ring"
        style={{ width: '98%', height: '35.5%', transform: 'translate(-50%, -50%) rotate(-20.6deg)' }}
      >
        <span
          className="absolute size-[4.2%] rounded-full bg-[#ebe4ff] shadow-[0_0_12px_rgba(220,210,255,0.8)]"
          style={{ right: '4%', top: '8%' }}
        />
      </div>
      <span className="absolute size-[1.6%] rounded-full bg-[#aeb4ff]" style={{ left: '10%', top: '22%' }} />
      <span className="absolute size-[1.2%] rounded-full bg-[#aeb4ff]" style={{ right: '9%', bottom: '18%' }} />
    </div>
  );
}
