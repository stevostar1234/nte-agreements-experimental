// Version 1 stores the exact final, rounded contours drawn on screen and rasterised for transport.
export const WIDTH = 600;
export const HEIGHT = 180;
export const MAX_VECTOR = 28000;
const round = value => Math.round(value * 10) / 10;

export function contourPath(outline) {
  if (outline.length < 3) return '';
  const first = outline[0];
  const parts = ['M', round(first[0]), round(first[1])];
  for (let index = 0; index < outline.length; index++) {
    const current = outline[index], next = outline[(index + 1) % outline.length];
    parts.push('Q', round(current[0]), round(current[1]), round((current[0] + next[0]) / 2), round((current[1] + next[1]) / 2));
  }
  parts.push('Z');
  return parts.join(' ');
}

export function parseVector(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_VECTOR) throw new Error('Signature is missing or too large.');
  const vector = JSON.parse(raw);
  if (Object.keys(vector).sort().join(',') !== 'height,paths,version,width' || vector.version !== 1 ||
      vector.width !== WIDTH || vector.height !== HEIGHT || !Array.isArray(vector.paths) ||
      vector.paths.length < 1 || vector.paths.length > 24) throw new Error('Unsupported signature format.');
  let coordinates = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const path of vector.paths) {
    if (typeof path !== 'string' || path.length > 18000 || !path.startsWith('M ') || !path.endsWith(' Z')) throw new Error('Invalid signature contour.');
    const tokens = path.split(' ');
    let index = 0;
    while (index < tokens.length) {
      const command = tokens[index++];
      if (command === 'Z' && index === tokens.length) break;
      const count = command === 'Q' ? 4 : ((command === 'L' || (command === 'M' && index === 1)) ? 2 : 0);
      if (!count || index + count >= tokens.length) throw new Error('Invalid signature command.');
      for (let position = 0; position < count; position++) {
        const token = tokens[index++];
        if (!/^-?\d{1,3}(\.\d)?$/.test(token)) throw new Error('Invalid signature coordinate.');
        const number = Number(token), isX = position % 2 === 0;
        if (number < -10 || number > (isX ? 610 : 190)) throw new Error('Signature is outside the signing area.');
        if (isX) {minX = Math.min(minX, number); maxX = Math.max(maxX, number);}
        else {minY = Math.min(minY, number); maxY = Math.max(maxY, number);}
        if (++coordinates > 6000) throw new Error('Signature is too complex. Please clear it and sign again.');
      }
    }
  }
  if (coordinates < 16 || maxX - minX < 20 || maxY - minY < 4) throw new Error('Please draw your full signature, rather than a tap or short mark.');
  return vector;
}

export function serializePaths(paths) {
  const raw = JSON.stringify({version:1, width:WIDTH, height:HEIGHT, paths});
  parseVector(raw);
  return raw;
}
