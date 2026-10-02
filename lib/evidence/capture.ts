import { DHASH_HEIGHT, DHASH_WIDTH, dHashFromGrey, grey } from "./dhash";

// Browser side of evidence capture: the photo's dHash, worked out on the tablet like its SHA-256,
// and the place of the assessment session, taken only when the assessor taps "Record place".

/** dHash of an image file, or null when the browser cannot decode it (for example HEIC). */
export async function dHashOfImage(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    // Shrink in two steps so the 9 x 8 grid averages the photo instead of sampling a few pixels.
    const mid = document.createElement("canvas");
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    mid.width = Math.max(DHASH_WIDTH, Math.round(bitmap.width * scale));
    mid.height = Math.max(DHASH_HEIGHT, Math.round(bitmap.height * scale));
    const midCtx = mid.getContext("2d")!;
    midCtx.imageSmoothingQuality = "high";
    midCtx.drawImage(bitmap, 0, 0, mid.width, mid.height);
    const small = document.createElement("canvas");
    small.width = DHASH_WIDTH;
    small.height = DHASH_HEIGHT;
    const ctx = small.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mid, 0, 0, DHASH_WIDTH, DHASH_HEIGHT);
    const { data } = ctx.getImageData(0, 0, DHASH_WIDTH, DHASH_HEIGHT);
    const values: number[] = [];
    for (let i = 0; i < data.length; i += 4)
      values.push(grey(data[i]!, data[i + 1]!, data[i + 2]!));
    return dHashFromGrey(values);
  } catch {
    return null;
  }
}

/** Places are kept to 2 decimal places, about 1 km: enough to check travel, not to find a house. */
export const PLACE_DECIMALS = 2;

export type Place = { lat: number; lon: number; at: string };

const round = (x: number) => Math.round(x * 10 ** PLACE_DECIMALS) / 10 ** PLACE_DECIMALS;

/** The device's position, rounded, or a reason why there is none. Never retried silently. */
export function currentPlace(timeoutMs = 10_000): Promise<Place | { error: string }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator))
      return resolve({ error: "this device has no location service" });
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: round(p.coords.latitude),
          lon: round(p.coords.longitude),
          at: new Date().toISOString(),
        }),
      (e) =>
        resolve({
          error:
            e.code === e.PERMISSION_DENIED
              ? "location permission was refused"
              : "the location could not be read",
        }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
    );
  });
}
