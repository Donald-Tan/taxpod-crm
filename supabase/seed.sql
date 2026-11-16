-- Optional demo data (fictional). Run after schema.sql.

with c as (
  insert into contacts (name, email, phone, company, status) values
    ('Aisyah Rahman',  'aisyah@contoh-trading.example',   '+60 12-555 0101', 'Contoh Trading Sdn Bhd',    'Customer'),
    ('Daniel Lim',     'daniel@limassociates.example',    '+60 16-555 0102', 'Lim & Associates',          'Prospect'),
    ('Kavitha Nair',   'kavitha@nairlogistics.example',   '+60 17-555 0103', 'Nair Logistics Sdn Bhd',    'Prospect'),
    ('Marcus Wong',    'marcus@borneofoods.example',      '+60 19-555 0104', 'Borneo Foods Enterprise',   'Lead'),
    ('Nurul Huda',     'nurul@hudaclinic.example',        '+60 13-555 0105', 'Klinik Huda',               'Lead'),
    ('Raj Kumar',      'raj@rkengineering.example',       '+60 12-555 0106', 'RK Engineering Works',      'Customer')
  returning id, name
),
o as (
  insert into opportunities (contact_id, title, value_rm, stage)
  select c.id, v.title, v.value_rm, v.stage
  from (values
    ('Aisyah Rahman', 'Corporate plan renewal (20 seats)',   18000.00, 'Won'),
    ('Daniel Lim',    'e-Invoicing readiness workshop',      12500.00, 'Proposal'),
    ('Kavitha Nair',  'SST compliance training package',      8400.00, 'Qualified'),
    ('Marcus Wong',   'taxPOD annual subscription (5 seats)', 4500.00, 'New'),
    ('Nurul Huda',    'Single-user subscription',              980.00, 'Contacted'),
    ('Raj Kumar',     'In-house tax seminar',                15000.00, 'Proposal'),
    ('Kavitha Nair',  'Zen AI add-on trial',                  2400.00, 'Lost')
  ) as v (contact_name, title, value_rm, stage)
  join c on c.name = v.contact_name
  returning id, title, stage
)
insert into activity_events (entity_type, entity_id, action, summary)
select 'opportunity', o.id, 'created', 'Opportunity "' || o.title || '" created in ' || o.stage
from o;
