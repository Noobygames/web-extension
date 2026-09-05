/**
 * CRC-32, the one both PNG and ZIP check their chunks with.
 *
 * Shared so `make-logo.mjs` and `zip.mjs` do not each carry a copy of the table.
 */
const TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/**
 * @param {Uint8Array} buffer
 * @returns {number} unsigned 32-bit checksum
 */
export function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export default crc32;
