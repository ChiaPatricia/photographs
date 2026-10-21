// Minimal ICC v2 profiles, written by hand so the pipeline needs no external profile files.
//
// Many cameras (Canon's "_MG_" files among them) record Adobe RGB JPEGs without embedding a
// profile: they only set EXIF ColorSpace = Uncalibrated and InteropIndex = "R03". Image
// libraries then assume sRGB and the colours come out dull. We build an Adobe RGB (1998)
// compatible profile from the published primaries and attach it before processing.

const s15Fixed16 = (v) => Math.round(v * 65536);

function xyzType(x, y, z) {
  const b = Buffer.alloc(20);
  b.write('XYZ ', 0, 'latin1');
  b.writeInt32BE(s15Fixed16(x), 8);
  b.writeInt32BE(s15Fixed16(y), 12);
  b.writeInt32BE(s15Fixed16(z), 16);
  return b;
}

function curveType(gamma) {
  const b = Buffer.alloc(16); // 14 bytes of data, padded to 4
  b.write('curv', 0, 'latin1');
  b.writeUInt32BE(1, 8);
  b.writeUInt16BE(Math.round(gamma * 256), 12); // u8Fixed8Number
  return b.subarray(0, 14);
}

function textDescriptionType(text) {
  const ascii = Buffer.from(text + '\0', 'latin1');
  const b = Buffer.alloc(12 + ascii.length + 4 + 4 + 2 + 1 + 67);
  b.write('desc', 0, 'latin1');
  b.writeUInt32BE(ascii.length, 8);
  ascii.copy(b, 12);
  return b; // unicode and ScriptCode parts left empty (all zero)
}

function textType(text) {
  const ascii = Buffer.from(text + '\0', 'latin1');
  const b = Buffer.alloc(8 + ascii.length);
  b.write('text', 0, 'latin1');
  ascii.copy(b, 8);
  return b;
}

function buildProfile(description, { white, red, green, blue, gamma }) {
  const trc = curveType(gamma);
  const tags = [
    ['desc', textDescriptionType(description)],
    ['cprt', textType('No copyright, use freely')],
    ['wtpt', xyzType(...white)],
    ['rXYZ', xyzType(...red)],
    ['gXYZ', xyzType(...green)],
    ['bXYZ', xyzType(...blue)],
    ['rTRC', trc],
    ['gTRC', trc],
    ['bTRC', trc],
  ];

  const tableSize = 4 + tags.length * 12;
  let offset = 128 + tableSize;
  const blobs = [];
  const entries = [];
  const shared = new Map();
  for (const [sig, data] of tags) {
    if (shared.has(data)) {
      entries.push([sig, shared.get(data), data.length]);
      continue;
    }
    const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
    data.copy(padded);
    entries.push([sig, offset, data.length]);
    shared.set(data, offset);
    blobs.push(padded);
    offset += padded.length;
  }

  const header = Buffer.alloc(128);
  header.writeUInt32BE(offset, 0);
  header.writeUInt32BE(0x02100000, 8); // version 2.1
  header.write('mntr', 12, 'latin1');
  header.write('RGB ', 16, 'latin1');
  header.write('XYZ ', 20, 'latin1');
  [2026, 1, 1, 0, 0, 0].forEach((v, i) => header.writeUInt16BE(v, 24 + i * 2));
  header.write('acsp', 36, 'latin1');
  header.writeInt32BE(s15Fixed16(0.9642), 68); // PCS illuminant, D50
  header.writeInt32BE(s15Fixed16(1.0), 72);
  header.writeInt32BE(s15Fixed16(0.8249), 76);

  const table = Buffer.alloc(tableSize);
  table.writeUInt32BE(tags.length, 0);
  entries.forEach(([sig, off, size], i) => {
    table.write(sig, 4 + i * 12, 'latin1');
    table.writeUInt32BE(off, 8 + i * 12);
    table.writeUInt32BE(size, 12 + i * 12);
  });

  return Buffer.concat([header, table, ...blobs]);
}

// Colorants are the Bradford-adapted (D50) values published with Adobe RGB (1998);
// the white point is D65 and the tone curve a pure gamma of 563/256.
export const ADOBE_RGB = buildProfile('Adobe RGB (1998) compatible', {
  white: [0.95045, 1.0, 1.08905],
  red: [0.60974, 0.31111, 0.01947],
  green: [0.20528, 0.62567, 0.06087],
  blue: [0.14919, 0.06322, 0.74457],
  gamma: 563 / 256,
});

/** Reads the description of an ICC profile (v2 'desc' or v4 'mluc'). */
export function describeProfile(icc) {
  try {
    const count = icc.readUInt32BE(128);
    for (let i = 0; i < count; i++) {
      const at = 132 + i * 12;
      if (icc.toString('latin1', at, at + 4) !== 'desc') continue;
      const off = icc.readUInt32BE(at + 4);
      const type = icc.toString('latin1', off, off + 4);
      if (type === 'desc') {
        const n = icc.readUInt32BE(off + 8);
        return icc.toString('latin1', off + 12, off + 12 + n - 1);
      }
      if (type === 'mluc') {
        const len = icc.readUInt32BE(off + 20);
        const start = icc.readUInt32BE(off + 24);
        const raw = icc.subarray(off + start, off + start + len);
        let s = '';
        for (let j = 0; j + 1 < raw.length; j += 2) s += String.fromCharCode(raw.readUInt16BE(j));
        return s;
      }
    }
  } catch {
    /* unreadable profile */
  }
  return '';
}
