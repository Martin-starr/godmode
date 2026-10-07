-- 010 enabled RLS on dash.ai_usage without a policy, so inserts from the
-- dash_app role (the dashboard and the SEO agent) were rejected and nothing
-- was logged. The other dash tables run without RLS and rely on grants; this
-- keeps RLS on and lets dash_app read and write. Applied 2026-10-07.
create policy ai_usage_app_rw on dash.ai_usage for all to dash_app using (true) with check (true);
grant usage, select on sequence dash.ai_usage_id_seq to dash_app;
