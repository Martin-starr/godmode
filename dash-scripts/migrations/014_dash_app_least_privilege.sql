-- 014 — least privilege for dash_app after 013.
--
-- The v1 routes insert into public.logs and delete fresh rows from it, and
-- insert/upsert into the two sensor tables. Nothing updates public.logs and
-- nothing deletes sensor rows, so those rights are taken back. 013 stays as
-- applied; this runs after it. Applied to production 2026-10-28.
revoke update on public.logs from dash_app;
revoke delete on public.sensor_readings from dash_app;
revoke delete on public.sensor_channels from dash_app;
