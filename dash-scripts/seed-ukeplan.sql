-- UKEPLAN SOLO DRIFT — Utkast v1, juli 2026 (Martin Folkestad)
--
-- Transcribed from the printed plan, one row per line of the poster. Re-runnable:
-- it clears and rewrites only the two routines it owns, so editing this file and
-- re-applying is the way to publish a v2. Nothing else in dash is touched.
--
--   psql "$DASH_DATABASE_URL" -f dash-scripts/seed-ukeplan.sql
--
-- Times are minutes past midnight (07:30 = 450). The poster's own words:
-- "tider er ankere, ikke lover".

begin;

delete from dash.routines where name in ('Daglig ramme', 'Uken');

insert into dash.routines (name, cadence, sort) values
  ('Daglig ramme', 'daily',  0),
  ('Uken',         'weekly', 1);

-- ── DAGLIG RAMME ────────────────────────────────────────────────────────
insert into dash.routine_items
  (routine_id, block, text, detail, start_min, end_min, drop_rank, never_drop, sort)
select r.id, v.block, v.text, v.detail, v.s, v.e, v.dr, v.nd, v.sort
from dash.routines r, (values
  ('DAGLIG DRIFT', 'Visuell sjekk + logging',
   'Mark, pre-kompost, wedger. pH, fuktighet, temperatur. Ekstra i termofil fase. Telefonen i lomma.',
   450, 480, null::integer, 1, 0),
  ('ORDEN', 'Papp · pre-kompost · løvblader · søppel',
   'Rydd området.', 480, 495, null, 0, 1),
  ('CEO 1', 'Ukens tema (se under)',
   'Ingen e-post, ingen Instagram.', 495, 585, null, 0, 2),
  ('PAUSE', 'Reis deg. Beveg deg.',
   'Ikke sitt gjennom denne.', 585, 600, null, 0, 3),
  ('CEO 2', 'Fortsettelse eller dagens tema.',
   '', 600, 660, 3, 0, 4),
  ('LUNSJ', '60 sekunders innboks-skann',
   'Ingen svar. Kun for å fange noe som virkelig må flyttes i dag.', 660, 705, null, 0, 5),
  ('FYSISK', 'Dagens hovedoppgave',
   'Tungt arbeid legges hit — ikke tidlig morgen (ryggen).', 705, 825, null, 0, 6),
  ('KONTROLL', 'Andre temperatursjekk termofil. Lukk dagens logg.',
   '', 825, 855, null, 1, 7),
  ('FLEKS', 'Buffer for dagsform',
   'God rygg → mer fysisk. Dårlig rygg → CEO-overskudd. Denne timen beskytter CEO-blokka.',
   855, 915, 1, 0, 8),
  ('E-POST', 'Les og svar. Én runde.',
   'Kunder og leverandører først.', 915, 945, null, 0, 9),
  ('INSTAGRAM', '15 min engagement',
   'Post på man / ons / fre.', 945, 960, 2, 0, 10)
) as v(block, text, detail, s, e, dr, nd, sort)
where r.name = 'Daglig ramme';

-- ── UKEN ────────────────────────────────────────────────────────────────
-- CEO-tema om formiddagen · fysisk arbeid om ettermiddagen
insert into dash.routine_items
  (routine_id, block, text, detail, weekday, never_drop, sort)
select r.id, v.block, v.text, v.detail, v.wd, v.nd, v.sort
from dash.routines r, (values
  -- MANDAG
  ('CEO-BLOKK', 'Inspeksjon & regelverk.', 'Kun dette til den er booket og bestått.', 1, 0, 0),
  ('FYSISK',    'Mat makkene',             '',                                        1, 1, 1),
  ('ELLERS',    'IG-post',                 '',                                        1, 0, 2),
  -- TIRSDAG
  ('CEO-BLOKK', '1: Forhandlere & partnere (utsendelser, oppfølging)', '',            2, 0, 3),
  ('CEO-BLOKK', '2: Søknader & dokumentasjon', '',                                    2, 0, 4),
  ('FYSISK',    'Logistikk, bestillinger.', 'Ta av tildekking over høsteområdet.',    2, 0, 5),
  -- ONSDAG
  ('CEO-BLOKK', 'Lett med vilje: fakturering, tall, admin.', '',                      3, 0, 6),
  ('FYSISK',    'Høsting — ukens tyngste dag', '',                                    3, 1, 7),
  ('ELLERS',    'IG-post',                 '',                                        3, 0, 8),
  -- TORSDAG
  ('CEO-BLOKK', 'Søknader / dokumentasjon fortsetter, eller overskudd fra tidligere.', '', 4, 0, 9),
  ('FYSISK',    'Ta igjen fra tirsdagens liste', '',                                  4, 0, 10),
  -- FREDAG
  ('CEO-BLOKK', 'Innhold + ukeoppsummering + planlegg neste uke.', '',                5, 0, 11),
  ('FYSISK',    'Mat makkene.',            'Aldri høsting.',                          5, 1, 12),
  ('ELLERS',    'IG-post',                 '',                                        5, 0, 13),
  -- LØRDAG
  ('FYSISK',    '30 min: visuell sjekk, logg, temperatur termofil.',
   'Søndag fri — med mindre noe går varmt.',                                          6, 1, 14)
) as v(block, text, detail, wd, nd, sort)
where r.name = 'Uken';

-- ── FASTE REGLER + ÅPEN SAK ─────────────────────────────────────────────
delete from dash.house_rules;

insert into dash.house_rules (kind, text, detail, sort) values
  ('regel', 'Ingen e-post før 15:15.', 'Skann i lunsjen, svar én gang.', 0),
  ('regel', 'Logg hver dag — også når alt ser normalt ut.',
            'Loggen er beviset overfor inspeksjonen.', 1),
  ('regel', 'Termofil fase = hyppigere sjekk.',
            'Temperatur kan stige raskt og skade makkene.', 2),
  ('regel', 'Høsting ruller til torsdag hvis onsdag ikke rekker.', 'Aldri fredag.', 3),
  ('regel', 'Ingen tunge løft før 11:00.', '', 4),
  ('apen_sak', 'Én opplært reserve som kan mate og måle hvis du er ute en uke.',
   'Ikke en ansettelse — én person, to oppgaver, opplært på én ettermiddag. '
   'Anlegget tåler to dager. Det tåler ikke to uker.', 5);

commit;
