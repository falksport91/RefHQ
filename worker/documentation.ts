import catalog from '../docs/documentation-catalog.json' with { type: 'json' };
import { accountLifecycleDecision, type AccountLifecycleEnv } from './account-lifecycle.ts';

type DocumentationEnv = AccountLifecycleEnv & {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
};
const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number) => new Response(message, { status, headers });

export async function documentationDownload(request: Request, env: DocumentationEnv, fetcher: typeof fetch = fetch) {
  if (request.method !== 'GET') return fail('Method not allowed.', 405);
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer \S+$/.test(authorization)) return fail('Please sign in.', 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return fail('Documentation is not configured.', 503);
  const id = new URL(request.url).pathname.slice('/api/owner-documents/'.length);
  const document = catalog.find((item) => item.id === id);
  if (!document) return fail('Document not found.', 404);
  try {
    const base = env.SUPABASE_URL.replace(/\/$/, '');
    const authHeaders = { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization };
    const user = await fetcher(`${base}/auth/v1/user`, { headers: authHeaders });
    if (!user.ok) return fail('Please sign in again.', 401);
    const authenticated = await user.json() as { id?: string };
    if (!authenticated.id) return fail('Please sign in again.', 401);
    const lifecycle = await accountLifecycleDecision(env, authenticated.id, fetcher);
    if (!lifecycle.active) return fail('This account is not active.', 403);
    // Database-controlled owner status, never user-editable metadata or UI roles.
    const owner = await fetcher(`${base}/rest/v1/rpc/is_site_owner`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!owner.ok || await owner.json() !== true) return fail('Site owner access required.', 403);
    const asset = await env.ASSETS.fetch(new Request(new URL(`/api/owner-documents/${document.id}`, request.url)));
    if (!asset.ok) return fail('Document unavailable in this release.', 404);
    const types: Record<string, string> = {
      PDF: 'application/pdf', PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return new Response(asset.body, { headers: { ...headers,
      'Content-Type': types[document.format],
      'Content-Disposition': `attachment; filename="${document.source.split('/').pop()}"`,
    } });
  } catch {
    return fail('Unable to download right now. Please try again.', 503);
  }
}
