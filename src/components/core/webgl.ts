/**
 * Detects whether a usable WebGL context can be created. The probe context is
 * released immediately so it does not count against the browser's context limit.
 */
export function detectWebGL(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): boolean {
  if (!doc) return false;
  try {
    const canvas = doc.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export type CoreRenderMode = 'webgl' | 'static';

/** Decides how the Living Core renders. Primary features never depend on this. */
export function chooseCoreRenderMode(opts: {
  webglAvailable: boolean;
  reducedMotion: boolean;
  quality: 'auto' | 'high' | 'low' | 'static';
  webglFailed: boolean;
}): CoreRenderMode {
  if (!opts.webglAvailable || opts.webglFailed) return 'static';
  if (opts.quality === 'static' || opts.reducedMotion) return 'static';
  return 'webgl';
}
