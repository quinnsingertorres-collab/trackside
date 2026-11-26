// node test/photos-store-edit.mjs
// Edit/revert/delete behaviour of lib/photos-store.js against an in-memory stand-in for Vercel Blob.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
fs.writeFileSync(path.join(dir, 'fake-blob.mjs'), `export const files = new Map(); // path -> { body, contentType }
let ver = 0;
export class BlobNotFoundError extends Error {}
const urlFor = (p) => 'https://fake.blob/' + p;
globalThis.fetch = async (u) => {
  const p = String(u).replace('https://fake.blob/', '');
  const f = files.get(p);
  if (!f) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => JSON.parse(f.body), body: f.body };
};
export async function head(p) { const f = files.get(p); if (!f) throw new BlobNotFoundError(p); return { url: urlFor(p), etag: 'v' + f.ver }; }
export async function put(p, body, opts = {}) {
  const f = files.get(p);
  if (opts.ifMatch && (!f || 'v' + f.ver !== opts.ifMatch)) throw new Error('precondition failed');
  files.set(p, { body: typeof body === 'string' ? body : Buffer.from(body).toString('latin1'), contentType: opts.contentType, ver: ++ver });
  return { url: urlFor(p) };
}
export async function del(p) { files.delete(p); }
export async function list() { return { blobs: [] }; }
`);
fs.writeFileSync(
  path.join(dir, 'store.mjs'),
  fs.readFileSync(path.join(here, '..', 'lib', 'photos-store.js'), 'utf8').replace('from "@vercel/blob"', 'from "./fake-blob.mjs"')
);
const { files } = await import(pathToFileURL(path.join(dir, 'fake-blob.mjs')).href);
const { addPhoto, readPhotos, replacePhotoImage, revertPhoto, deletePhotoById } = await import(pathToFileURL(path.join(dir, 'store.mjs')).href);

const entry = { id: 'p1', carId: 'Green-3622', line: 'Green', number: 3622, path: 'photos/Green-3622/p1.jpg', uploadedAt: '2026-01-01T00:00:00Z' };
await addPhoto({ entry, buffer: Buffer.from('ORIGINAL'), contentType: 'image/jpeg' });
const imgs = () => [...files.keys()].filter(k => k.startsWith('photos/')).sort();
assert.deepEqual(imgs(), ['photos/Green-3622/p1.jpg']);

// first edit: original kept, new file, edits recorded
let p = await replacePhotoImage({ id: 'p1', buffer: Buffer.from('EDIT1'), contentType: 'image/jpeg', edits: { exposure: 0.5 } });
assert.equal(p.originalPath, 'photos/Green-3622/p1.jpg');
assert.notEqual(p.path, p.originalPath); assert.deepEqual(p.edits, { exposure: 0.5 });
assert.equal(imgs().length, 2, 'original + edited');
assert.equal(p.originalUrl, 'https://fake.blob/photos/Green-3622/p1.jpg');

// second edit: previous edited file deleted, original untouched
const firstEdited = p.path;
p = await replacePhotoImage({ id: 'p1', buffer: Buffer.from('EDIT2'), contentType: 'image/jpeg', edits: { exposure: 1 } });
assert.equal(p.originalPath, 'photos/Green-3622/p1.jpg');
assert(!files.has(firstEdited), 'old edit removed');
assert.equal(imgs().length, 2);
assert.equal((await readPhotos())[0].edits.exposure, 1);
assert.equal(files.get('photos/Green-3622/p1.jpg').body, 'ORIGINAL');

// unknown id: nothing written
assert.equal(await replacePhotoImage({ id: 'nope', buffer: Buffer.from('X'), contentType: 'image/jpeg', edits: {} }), null);
assert.equal(imgs().length, 2, 'no stray blob for unknown id');

// revert: back to the original, edited file gone, edit fields cleared
const editedPath = p.path;
const r = await revertPhoto('p1');
assert.equal(r.path, 'photos/Green-3622/p1.jpg'); assert.equal(r.url, 'https://fake.blob/photos/Green-3622/p1.jpg');
assert(!('originalPath' in r) && !('edits' in r) && !('editedAt' in r));
assert(!files.has(editedPath)); assert.deepEqual(imgs(), ['photos/Green-3622/p1.jpg']);
assert.equal(await revertPhoto('p1'), null, 'nothing to revert');

// delete removes both files for an edited photo
await replacePhotoImage({ id: 'p1', buffer: Buffer.from('EDIT3'), contentType: 'image/jpeg', edits: { contrast: 10 } });
assert.equal(imgs().length, 2);
await deletePhotoById('p1');
assert.deepEqual(imgs(), []); assert.deepEqual(await readPhotos(), []);
console.log('photos-store edit tests OK');
