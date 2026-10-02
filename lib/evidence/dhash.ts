// 64-bit difference hash (dHash) of a photo (TRD M5). The photo is shrunk to 9 x 8 grey pixels and
// each of the 64 bits says whether a pixel is brighter than its right-hand neighbour. A re-saved,
// resized or recompressed copy of a photo keeps almost the same bits, so two hashes a few bits
// apart point at the same picture, which a SHA-256 of the file misses after any re-save. The CAG
// audit of PMKVY found the same photos reused across batches [S14].
//
// Pure functions only: the browser shrinks the image (lib/evidence/capture.ts) and passes the grey
// values in, so the same code runs in tests and on the tablet.

export const DHASH_WIDTH = 9;
export const DHASH_HEIGHT = 8;

/** Luma of one RGB pixel (ITU-R BT.601 weights). */
export function grey(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** dHash of a 9 x 8 grey image given row by row, as 16 lower-case hex digits. */
export function dHashFromGrey(pixels: ArrayLike<number>): string {
  if (pixels.length !== DHASH_WIDTH * DHASH_HEIGHT)
    throw new Error(`dHash needs ${DHASH_WIDTH * DHASH_HEIGHT} grey values`);
  let hex = "";
  let nibble = 0;
  let count = 0;
  for (let y = 0; y < DHASH_HEIGHT; y++) {
    for (let x = 0; x < DHASH_WIDTH - 1; x++) {
      const left = pixels[y * DHASH_WIDTH + x]!;
      const right = pixels[y * DHASH_WIDTH + x + 1]!;
      nibble = (nibble << 1) | (left > right ? 1 : 0);
      if (++count % 4 === 0) {
        hex += nibble.toString(16);
        nibble = 0;
      }
    }
  }
  return hex;
}

/** Number of differing bits between two 16-digit hex hashes. */
export function hamming(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b))
    throw new Error("a dHash is 16 hex digits");
  let n = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}
