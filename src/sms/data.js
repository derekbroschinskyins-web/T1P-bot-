export async function readRows(url, key, table, params, request = fetch) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const query = new URLSearchParams({ ...params, limit: '1000', offset: String(offset) });
    const response = await request(`${url.replace(/\/$/, '')}/rest/v1/${table}?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Supabase read failed (${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('Invalid Supabase response');
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
export async function loadLeaderboardData(env, window, request = fetch) {
  const [roster, deals] = await Promise.all([
    readRows(env.T1P_SUPABASE_URL, env.T1P_SUPABASE_SERVICE_KEY, 'agents', { select: 'id,name,metro_name', order: 'id.asc' }, request),
    readRows(env.METRO_SUPABASE_URL, env.METRO_SUPABASE_SERVICE_KEY, 'deals', {
      select: 'id,agent_name,created_at', order: 'id.asc',
      and: `(created_at.gte.${window.start},created_at.lte.${window.cutoff})`,
    }, request),
  ]);
  return { roster, deals };
}
