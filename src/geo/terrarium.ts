/**
 * Terrarium height decoding: h = (r*256 + g + b/256) - 32768, in EGM96 meters.
 */
export function decodeTerrariumPng(width: number, height: number, rgbaBytes: Uint8Array): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const j = i * 4;
    const r = rgbaBytes[j];
    const g = rgbaBytes[j + 1];
    const b = rgbaBytes[j + 2];
    out[i] = r * 256 + g + b / 256 - 32768;
  }
  return out;
}
