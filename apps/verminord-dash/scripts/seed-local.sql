-- Local development seed. Passwords are all "test123" (scrypt, see lib/auth.js).
insert into dash.team (name, role, access, pw) values
  ('Mathias', 'Drift · daglig ansvar', 'Admin', :'pw'),
  ('Martin', 'Anlegg og produksjon', 'Redigering', :'pw'),
  ('Regnskap', 'Ekstern', 'Kun lesing', :'pw');

insert into dash.systems (id, sort, status) values
  ('CFT1', 0, 'I drift'), ('CFT2', 1, 'I drift'), ('CFT3', 2, 'I drift'),
  ('Wedge 1', 3, 'I drift'), ('Breeder Bin', 4, 'I drift');

insert into dash.targets (metric, min, max) values
  ('temp', 18, 28), ('ph', 6.5, 8), ('fukt', 65, 85), ('hygiene', 70, 60);

insert into dash.tasks (title, sub, tag, tagcls, who, open) values
  ('Følge opp dyrkeprosjekt', 'Hente første tilbakemelding.', 'Avklar', 'gold', 'Mathias', 1),
  ('Fôre CFT1 og CFT2', 'Med forberedt materiale.', 'Rutine', '', 'Mathias', 1);

insert into dash.projects (col, tag, title, descr, who, sort) values
  ('Planlagt', 'Salg', 'Kartlegge støtteordninger', 'Innovasjon Norge m.fl.', 'Mathias', 0),
  ('Pågår', 'Anlegg', 'Ferdigstille lokalet', 'Skilting og rydding.', 'Martin', 1);

insert into dash.checklist (project_id, text, done, sort) values
  (1, 'Liste over ordninger', 0, 0), (1, 'Første møte booket', 1, 1), (2, 'Materialliste', 1, 0);

insert into dash.partners (name, type, status, tagcls, next_step, who) values
  ('Innovasjon Norge', 'Støtte', 'Avklar', 'gold', 'Booke møte.', 'Mathias');

insert into dash.readings (system, date, temp, ph, fukt, for_l, notat, avvik, logged_by, source)
select s.id,
       to_char(current_date - i, 'YYYY-MM-DD'),
       20 + 3 * sin(i / 3.0) + row_number() over () % 2,
       7.2 + 0.3 * cos(i / 4.0),
       72 + 6 * sin(i / 5.0),
       case when i % 3 = 0 then 20 else 0 end,
       '', 0, 'Martin', case when i % 2 = 0 then 'sheets' else '' end
from generate_series(0, 40) i
cross join (select id from dash.systems) s;
