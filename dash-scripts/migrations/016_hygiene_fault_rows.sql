-- 016: logger fault cells are stored, not dropped (31 Oct 2026).
--
-- When the Center 374 cannot read a probe it writes "----" or "OL" in that
-- cell. The importer now stores such a cell as a reading with no
-- temperature and excluded = 'sondefeil …', so the §19 check sets that probe
-- aside around it instead of bridging the hole as if nothing happened.
alter table dash.hygiene_readings alter column temp drop not null;
