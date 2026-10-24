/** EWKB hex of a SRID 4326 point, as PostgREST prints geography (uppercase, little endian). */
export function ewkbPoint(lng: number, lat: number): string {
  const bytes = new DataView(new ArrayBuffer(25));
  bytes.setUint8(0, 1);
  bytes.setUint32(1, 0x20000001, true);
  bytes.setUint32(5, 4326, true);
  bytes.setFloat64(9, lng, true);
  bytes.setFloat64(17, lat, true);
  return [...new Uint8Array(bytes.buffer)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
