/**
 * Zips a directory, without needing `zip` on the PATH.
 *
 *   node scripts/zip.mjs <output.zip> <directory>
 *
 * `packaging.sh` used the `zip` binary, which Git Bash on Windows does not ship - so
 * the one script that produces the store uploads could not be run or tested on the
 * machine most of this repo is written on, and CI had to hope the runner image kept
 * providing it. Deflate is in `node:zlib` and the container format is a few
 * length-prefixed headers, so there is nothing here worth a dependency.
 *
 * Deterministic on purpose: entries are sorted and every timestamp is fixed, so the
 * same source tree produces a byte-identical zip. Two builds that differ only in when
 * they ran are two builds nobody can compare.
 */
import { deflateRawSync } from "node:zlib";
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

import { crc32 } from "./crc32.mjs";

/** 1980-01-01 00:00, the zero of the MS-DOS timestamp zip stores. */
const DOS_TIME = 0;
const DOS_DATE = 33;

/** @returns {string[]} every file under `dir`, as paths relative to it, sorted. */
function walk(dir, prefix = "") {
  const found = [];

  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) found.push(...walk(path.join(dir, entry.name), relative));
    else if (entry.isFile()) found.push(relative);
  }

  return found;
}

/**
 * @param {string} outFile
 * @param {string} dir
 */
export function zipDirectory(outFile, dir) {
  const files = walk(dir);
  const local = [];
  const central = [];
  let offset = 0;

  for (const name of files) {
    const content = readFileSync(path.join(dir, name));
    const deflated = deflateRawSync(content, { level: 9 });
    // Stored beats deflate on already-compressed files (the PNGs), and a zip entry may
    // not be larger than what it holds.
    const stored = deflated.length >= content.length;
    const data = stored ? content : deflated;
    const nameBytes = Buffer.from(name, "utf8");
    const checksum = crc32(content);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(stored ? 0 : 8, 8); // method
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28); // no extra field

    local.push(header, nameBytes, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(stored ? 0 : 8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(content.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(0o644 << 16, 38); // external attributes: a plain readable file
    entry.writeUInt32LE(offset, 42);

    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + data.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(outFile, Buffer.concat([...local, centralBuffer, end]));

  return { files: files.length, bytes: statSync(outFile).size };
}

const [outFile, dir] = process.argv.slice(2);

if (outFile && dir) {
  const { files, bytes } = zipDirectory(path.resolve(outFile), path.resolve(dir));
  console.log(`Wrote ${outFile} (${files} files, ${Math.round(bytes / 1024)} KB)`);
}
