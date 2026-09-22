import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { documentationDownload } from '../worker/documentation.ts';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test', ASSETS: { fetch: async () => new Response('document bytes') } };
const request = (id = 'updates') => new Request(`https://law18ref.com/api/owner-documents/${id}`, { headers: { Authorization: 'Bearer test' } });
test('documentation denies anonymous users without reading assets', async () => {
  const response = await documentationDownload(new Request(request().url), env, () => { throw Error('must not fetch'); });
  assert.equal(response.status, 401);
});
test('documentation denies non-owners, invalid tokens, and unavailable permission checks', async () => {
  for (const responses of [[new Response('', {status:401})], [Response.json({id:'00000000-0000-4000-8000-000000000001'}), new Response('false')], [Response.json({id:'00000000-0000-4000-8000-000000000001'}), new Response('', {status:500})]]) {
    let assets = 0;
    const response = await documentationDownload(request(), {...env, ASSETS: {fetch: async () => { assets++; return new Response('bad'); }}}, async () => responses.shift());
    assert.ok([401,403].includes(response.status)); assert.equal(assets, 0);
  }
});
test('owner downloads use current database permission and are never cached', async () => {
  const calls = [];
  const response = await documentationDownload(request(), env, async (url, options) => {
    calls.push([url,options]); return calls.length === 1
      ? Response.json({id:'00000000-0000-4000-8000-000000000001'})
      : new Response('true');
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'document bytes');
  assert.match(calls[1][0], /rpc\/is_site_owner$/);
  assert.equal(calls[1][1].headers.Authorization, 'Bearer test');
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.match(response.headers.get('Content-Disposition'), /Law18Ref_Update_History.xlsx/);
});
test('documentation restricts file IDs and methods', async () => {
  assert.equal((await documentationDownload(request('unknown'), env)).status,404);
  assert.equal((await documentationDownload(new Request(request(),{method:'POST'}),env)).status,405);
});
test('all packaged documentation assets match their canonical source files', async () => {
  const catalog = JSON.parse(await readFile(new URL('../docs/documentation-catalog.json',import.meta.url),'utf8'));
  assert.equal(catalog.length,11);
  assert.ok(catalog.some((doc) => doc.id === 'future-plans'));
  for (const doc of catalog) assert.deepEqual(await readFile(new URL(`../dist/client/api/owner-documents/${doc.id}`,import.meta.url)),await readFile(new URL(`../${doc.source}`,import.meta.url)));
  const config=JSON.parse(await readFile(new URL('../dist/server/wrangler.json',import.meta.url),'utf8'));
  assert.ok(config.assets.run_worker_first.includes('/api/owner-documents/*'));
});
