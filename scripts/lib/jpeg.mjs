// Adds an ICC profile to a JPEG without re-encoding it: a single APP2 "ICC_PROFILE"
// segment is spliced in after the existing APPn segments. Only used in memory —
// original files are never written to.

export function withIccProfile(jpeg, icc) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  if (icc.length > 65519) throw new Error('profile too large for a single segment');

  let pos = 2;
  while (pos + 4 <= jpeg.length && jpeg[pos] === 0xff) {
    const marker = jpeg[pos + 1];
    if (marker < 0xe0 || marker > 0xef) break;
    pos += 2 + jpeg.readUInt16BE(pos + 2);
  }

  const id = Buffer.from('ICC_PROFILE\0', 'latin1');
  const length = 2 + id.length + 2 + icc.length;
  const segment = Buffer.alloc(2 + length);
  segment[0] = 0xff;
  segment[1] = 0xe2;
  segment.writeUInt16BE(length, 2);
  id.copy(segment, 4);
  segment[4 + id.length] = 1; // sequence number
  segment[5 + id.length] = 1; // total segments
  icc.copy(segment, 6 + id.length);

  return Buffer.concat([jpeg.subarray(0, pos), segment, jpeg.subarray(pos)]);
}
