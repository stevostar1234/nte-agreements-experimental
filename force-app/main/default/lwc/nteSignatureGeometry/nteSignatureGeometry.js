// Version 1 stores the final rounded contours used both on screen and for the PNG.
export const WIDTH = 600;
export const HEIGHT = 180;
export const MAX_VECTOR = 131072;
export const MAX_PNG = 131072;
export const CONTOUR_TOLERANCES = [0.12, 0.22, 0.35, 0.45];
const round = value => Math.round(value * 10) / 10;
const FLATNESS = 0.05;

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const length = dx * dx + dy * dy;
  const fraction = length ? Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length)) : 0;
  const x = point[0] - start[0] - fraction * dx;
  const y = point[1] - start[1] - fraction * dy;
  return x * x + y * y;
}

function flattenQuadratic(start, control, end, points) {
  // The quadratic's deviation from its chord is bounded by this midpoint offset.
  const dx = start[0] - 2 * control[0] + end[0];
  const dy = start[1] - 2 * control[1] + end[1];
  if (dx * dx + dy * dy <= 16 * FLATNESS * FLATNESS) {
    points.push(end);
    return;
  }
  const left = [(start[0] + control[0]) / 2, (start[1] + control[1]) / 2];
  const right = [(control[0] + end[0]) / 2, (control[1] + end[1]) / 2];
  const middle = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
  flattenQuadratic(start, left, middle, points);
  flattenQuadratic(middle, right, end, points);
}

function simplify(points, tolerance) {
  const result = [], squaredTolerance = tolerance * tolerance;
  // Bounded windows avoid quadratic work on a very long, jagged flourish.
  for (let start = 0; start < points.length - 1; start += 256) {
    const end = Math.min(start + 256, points.length - 1);
    const keep = new Uint8Array(end - start + 1), pending = [[start, end]];
    keep[0] = 1; keep[end - start] = 1;
    while (pending.length) {
      const [first, last] = pending.pop();
      let greatest = squaredTolerance, selected = -1;
      for (let index = first + 1; index < last; index++) {
        const distance = distanceToSegment(points[index], points[first], points[last]);
        if (distance > greatest) { greatest = distance; selected = index; }
      }
      if (selected !== -1) {
        keep[selected - start] = 1;
        if (selected - first > 1) pending.push([first, selected]);
        if (last - selected > 1) pending.push([selected, last]);
      }
    }
    for (let index = start; index < end; index++) if (keep[index - start]) result.push(points[index]);
  }
  result.push(points.at(-1));
  return result;
}

export function contourPath(outline, tolerance = CONTOUR_TOLERANCES[0]) {
  if (outline.length < 3) return '';
  const first = outline[0], flattened = [first];
  let start = first;
  for (let index = 0; index < outline.length; index++) {
    const current = outline[index], next = outline[(index + 1) % outline.length];
    const end = [(current[0] + next[0]) / 2, (current[1] + next[1]) / 2];
    flattenQuadratic(start, current, end, flattened);
    start = end;
  }
  flattened.push(first);
  const rounded = [];
  for (const point of simplify(flattened, tolerance)) {
    const value = [round(point[0]), round(point[1])], last = rounded.at(-1);
    if (!last || value[0] !== last[0] || value[1] !== last[1]) rounded.push(value);
  }
  // The closing command supplies the last segment without repeating coordinates.
  if (rounded.length > 1 && rounded[0][0] === rounded.at(-1)[0] && rounded[0][1] === rounded.at(-1)[1]) rounded.pop();
  if (rounded.length < 3) {
    // Keep tiny deliberate marks even if a coarser storage pass would collapse them.
    if (tolerance > CONTOUR_TOLERANCES[0]) return contourPath(outline, CONTOUR_TOLERANCES[0]);
    return '';
  }
  return rounded.map((point, index) => `${index ? 'L' : 'M'} ${point[0]} ${point[1]}`).join(' ') + ' Z';
}

export function parseVector(raw) {
  if (typeof raw !== 'string' || !raw) throw new Error('Please add your signature in the box.');
  if (raw.length > MAX_VECTOR) throw new RangeError('The signature exceeds Salesforce’s storage limit. Please undo some marks and try again.');
  const vector = JSON.parse(raw);
  if (!vector || Array.isArray(vector) || Object.keys(vector).sort().join(',') !== 'height,paths,version,width' ||
      vector.version !== 1 || vector.width !== WIDTH || vector.height !== HEIGHT ||
      !Array.isArray(vector.paths) || !vector.paths.length) throw new Error('Unsupported signature format.');
  for (const path of vector.paths) {
    if (typeof path !== 'string' || !path.startsWith('M ') || !path.endsWith(' Z')) throw new Error('Invalid signature contour.');
    const tokens = path.split(' ');
    let index = 0, segments = 0;
    while (index < tokens.length) {
      const command = tokens[index++];
      if (command === 'Z' && index === tokens.length) break;
      const count = command === 'Q' ? 4 : ((command === 'L' || (command === 'M' && index === 1)) ? 2 : 0);
      if (!count || index + count >= tokens.length) throw new Error('Invalid signature command.');
      if (command !== 'M') segments++;
      for (let position = 0; position < count; position++) {
        const token = tokens[index++];
        if (!/^-?\d{1,3}(\.\d)?$/.test(token)) throw new Error('Invalid signature coordinate.');
        const number = Number(token), isX = position % 2 === 0;
        if (number < -10 || number > (isX ? WIDTH + 10 : HEIGHT + 10)) throw new Error('Signature is outside the signing area.');
      }
    }
    if (!segments) throw new Error('Invalid signature contour.');
  }
  return vector;
}

export function serializePaths(paths) {
  const raw = JSON.stringify({version:1, width:WIDTH, height:HEIGHT, paths});
  parseVector(raw);
  return raw;
}
