// A link to the public status page is its token. Only a token that exists
// and has not been revoked opens the page or the CSV.
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export async function validToken(sql, token) {
  if (!TOKEN.test(String(token || ""))) return null;
  const rows = await sql`select token, label from dash.status_links where token = ${token} and revoked_at is null`;
  return rows[0] || null;
}

export async function noteVisit(sql, token) {
  await sql`update dash.status_links set views = views + 1, last_seen_at = now() where token = ${token}`;
}
