// The Vault front door: commit-pinned redirect + fixed-list asset mirror.
// verify_jwt off on purpose: public front door; app has its own PIN login.
//
// Why a redirect and not the HTML itself: the Supabase gateway rewrites any
// response on *.supabase.co to `content-type: text/plain` with `nosniff` and
// `default-src 'none'; sandbox`, so a page served from here renders as source
// text. Serving it needs a custom domain; until then we hand the browser a
// commit-pinned githack URL, which carries the right content type.
const OWNER_REPO = 'derekbroschinskyins-web/T1P-bot-';
const FALLBACK = `https://raw.githack.com/${OWNER_REPO}/main/site/index.html`;
const SHA_TTL = 30_000;
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
let sha = '';
let shaAt = 0;

const ASSETS: Array<{ src: string; dest: string; type: string }> = [
  { src: 'https://d8j0ntlcm91z4.cloudfront.net/user_3FB1kighHqFL8j67IRhUwyvjJ9f/hf_20260827_204921_81851960-d4a6-417e-82d6-4cef35f31faa.svg', dest: 'assets/mark-neon.svg', type: 'image/svg+xml' },
  { src: 'https://d8j0ntlcm91z4.cloudfront.net/user_3FB1kighHqFL8j67IRhUwyvjJ9f/hf_20260827_204921_e3edba66-3fb5-406a-9e4d-b5a15cedbc12.svg', dest: 'assets/wordmark-neon.svg', type: 'image/svg+xml' },
];

async function mirror(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const a of ASSETS) {
    try {
      const r = await fetch(a.src);
      if (!r.ok) { out[a.dest] = `source ${r.status}`; continue; }
      const bytes = new Uint8Array(await r.arrayBuffer());
      const up = await fetch(`${SB_URL}/storage/v1/object/site/${a.dest}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY,
          'Content-Type': a.type, 'x-upsert': 'true', 'cache-control': 'public, max-age=3600',
        },
        body: bytes,
      });
      out[a.dest] = up.ok ? `ok ${bytes.length}b` : `upload ${up.status}`;
    } catch (e) { out[a.dest] = String(e).slice(0, 120); }
  }
  return out;
}

async function latestSha(): Promise<string> {
  if (sha && Date.now() - shaAt < SHA_TTL) return sha;
  try {
    const r = await fetch(`https://api.github.com/repos/${OWNER_REPO}/commits/main`, {
      headers: { Accept: 'application/vnd.github.sha', 'User-Agent': 't1p-vault' },
    });
    if (r.ok) {
      const s = (await r.text()).trim();
      if (/^[0-9a-f]{40}$/.test(s)) { sha = s; shaAt = Date.now(); }
    }
  } catch (_e) { /* keep last known sha */ }
  return sha;
}

function targetFor(s: string): string {
  return s ? `https://rawcdn.githack.com/${OWNER_REPO}/${s}/site/index.html` : FALLBACK;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.has('mirror')) {
    return new Response(JSON.stringify(await mirror()), { status: 200 });
  }
  if (url.searchParams.has('sync')) {
    return new Response(null, { status: 204 });
  }
  const s = await latestSha();
  const target = targetFor(s);
  // Which build the vault is handing out, without following the redirect.
  if (url.searchParams.has('build')) {
    return new Response(JSON.stringify({
      commit: s || null,
      pinned: Boolean(s),
      target,
      resolved_at: s ? new Date(shaAt).toISOString() : null,
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: target, 'Cache-Control': 'no-store', 'X-Vault-Commit': s || 'main' },
  });
});
