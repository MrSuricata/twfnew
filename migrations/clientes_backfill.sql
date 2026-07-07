-- ============================================================
-- Backfill de unificación de clientes en shipments (generado 07/07/2026)
-- Reemplaza cada variante del nombre por el canónico del catálogo en:
--   (b) shipments.cliente
--   (c) shipments.sheet_raw->>'CLIENTE' (espejo FCL histórico)
--   (d) shipments.operativas[*].CLIENTE_OP (solo elementos cuyo valor exacto
--       esté en la lista de variantes — los alias cortos tipo "PERETTI DIRECT"
--       NO se tocan: llevan info de operativa)
-- Todo en UNA transacción, con backup previo de las filas afectadas.
--
-- Mapeo: 140 variantes → su canónico.
-- Filas esperadas a actualizar en shipments.cliente: ~260.
-- Grupos más grandes (variantes fusionadas → canónico):
--     31 filas → PELLACANI S.R.L.
--     19 filas → BALSAMO S.A
--     18 filas → TP S.R.L.
--     14 filas → HARDCORE FITNESS SRL
--      7 filas → AIT S.A
--      7 filas → ESPA S.A
--      7 filas → INELPA
--      6 filas → TACOMA ARGENTINA S.R.L
--      5 filas → CONAX SA
--      5 filas → FRIO RAF
--      5 filas → YEMEN S.A
--      4 filas → COSTAMAGNA CARLOS
--      4 filas → DABAR & CIA S.R.L.
--      4 filas → DELFABRO
--      4 filas → FRONTERA LIVING SA
--
-- Rollback: la tabla _backfill_clientes_backup_20260707 guarda id + valores
-- previos de cada fila tocada.
-- ============================================================

begin;

-- 1. Mapeo variante → canónico (solo variantes distintas del canónico)
create temp table tmp_cliente_map (variant text primary key, canonico text not null) on commit drop;
insert into tmp_cliente_map (variant, canonico) values
  ('ACORD GROUP S.R.L', 'ACCORD GROUP S.R.L'),
  ('AIT S.A.', 'AIT S.A'),
  ('AIT SA', 'AIT S.A'),
  ('ALFA ARGENTINA', 'ALFA ARGENTINA S.A'),
  ('ALFA ARGENTINA S.A.', 'ALFA ARGENTINA S.A'),
  ('ANDRETICH', 'ANDRETICH SA'),
  ('ARO PLASTYC S.A.S.', 'ARO PLASTYC S.A.S'),
  ('AUTOMATIZA S.A.', 'AUTOMATIZA S.A'),
  ('BALSAMO', 'BALSAMO S.A'),
  ('BALSAMO S.A.', 'BALSAMO S.A'),
  ('BALSAMO SA', 'BALSAMO S.A'),
  ('BASSO S.A.', 'BASSO'),
  ('BBM SOLUTIONS S.R.L', 'BBM SOLUTIONS S.R.L.'),
  ('BICILETAS TOMASELLI S.A.', 'BICICLETAS TOMASELLI S.A.'),
  ('BKSTM', 'BKSTM SAS'),
  ('BPB MEDITERRANEA S.A', 'BPB MEDITERRANEA S.A.'),
  ('CARLOS ANDRETICH S.A.', 'CARLOS ANDRETICH S.A'),
  ('CARRETELES RAFAELA S.A', 'CARRETELES RAFAELA SA'),
  ('CEDICOR S.R.L', 'CEDICOR'),
  ('CEDICOR S.R.L.', 'CEDICOR'),
  ('CENA HNOS', 'CENA HNOS SRL'),
  ('CENTRO SBZ', 'CENTRO SBZ S.A'),
  ('CONAX', 'CONAX SA'),
  ('CONAX S.A', 'CONAX SA'),
  ('COSTAMAGNA CARLOS S.A', 'COSTAMAGNA CARLOS'),
  ('COSTAMAGNA CARLOS S.A.', 'COSTAMAGNA CARLOS'),
  ('CPA PRODUCCIONES', 'CPA PRODUCCIONES S.R.L.'),
  ('Cultivar SRL', 'CULTIVAR S.R.L.'),
  ('CUSTOM AGENT SAS', 'CUSTOM AGENT S.A.S.'),
  ('DABAR & CIA S.R.L', 'DABAR & CIA S.R.L.'),
  ('DABAR Y CIA S.R.L', 'DABAR & CIA S.R.L.'),
  ('DABAR Y CIA S.R.L.', 'DABAR & CIA S.R.L.'),
  ('DABAR Y CIA SRL', 'DABAR & CIA S.R.L.'),
  ('DAFESE S.R.L', 'DAFESE S.R.L.'),
  ('DAYCO ARGENTINA', 'DAYCO ARGENTINA SA'),
  ('DEFESE S.R.L', 'DEFESE SRL'),
  ('DEL FABRO S.R.L', 'DELFABRO'),
  ('DEL FABRO S.R.L.', 'DELFABRO'),
  ('DELFABRO SRL', 'DELFABRO'),
  ('DENT 3D S.A.S', 'DENT 3D'),
  ('DENT 3D S.A.S.', 'DENT 3D'),
  ('DENT3D SAS', 'DENT3D S.R.L'),
  ('DENT3D SRL', 'DENT3D S.R.L'),
  ('DI TOMASO S.R.L', 'DI TOMASO S.R.L.'),
  ('D.O.M. DISTRIBUCIONES', 'D.O.M. DISTRIBUCIONES S.A.'),
  ('DOM DISTRUBUCIONES SA', 'D.O.M. DISTRIBUCIONES S.A.'),
  ('EL PANTA S.A', 'EL PANTA S.A.'),
  ('ELDA S.R.L.', 'ELDA S.R.L'),
  ('ELECTRO CORDOBA SA', 'ELECTRO CORDOBA S.A'),
  ('ELORZA AGRO SRL', 'ELORZA AGRO S.R.L'),
  ('EVACES CARAES S.A', 'ENVASES CARAES S.A.'),
  ('ESPA S.A.', 'ESPA S.A'),
  ('FRIO RAF S.A', 'FRIO RAF'),
  ('FRIO RAF S.A.', 'FRIO RAF'),
  ('FRONTERA LIVING', 'FRONTERA LIVING SA'),
  ('FRONTERA LIVING S.A', 'FRONTERA LIVING SA'),
  ('FRONTERA LIVING S.A.', 'FRONTERA LIVING SA'),
  ('GOOD RESRT S.R.L.', 'GOOD REST S.R.L.'),
  ('GRANA S.R.L.', 'GRANA SA'),
  ('GANADOS DEL CENTRO', 'GRANADOS DEL CENTRO'),
  ('GROBEAR, S.A.S.', 'GROBEAR S.A.S.'),
  ('HARDCORE FIRNESS SRL', 'HARDCORE FITNESS SRL'),
  ('HARDCORE FITNESS S.R.L', 'HARDCORE FITNESS SRL'),
  ('HARDCORE FITNESS S.R.L.', 'HARDCORE FITNESS SRL'),
  ('HARDOCE FITNESS S.R.L', 'HARDCORE FITNESS SRL'),
  ('HARDORE FITNESS S.R.L', 'HARDCORE FITNESS SRL'),
  ('HIDRAULICA DC', 'HIDRAULICA DC S.R.L.'),
  ('HIDRÁULICA SAN FRANCISCO SRL', 'HIDRÁULICA SAN FRANCISCO'),
  ('INDUSTRIAS JED SR.L.', 'INDUSTRIAS JED S.R.L.'),
  ('INDUSTRIAS JED SRL', 'INDUSTRIAS JED S.R.L.'),
  ('INELPA S.A', 'INELPA'),
  ('INELPA S.A.', 'INELPA'),
  ('INELPA TRANFORMADORES', 'INELPA TRANSFORMADORES'),
  ('INELPA TRANFORMADORES SA', 'INELPA TRANSFORMADORES'),
  ('INELPA TRANSFORMADORES SA', 'INELPA TRANSFORMADORES'),
  ('IR ARGENTINA  S.R.L', 'IR ARGENTINA S.R.L'),
  ('IR ARGENTINA S.R.L.', 'IR ARGENTINA S.R.L'),
  ('IR ARGENTINA SRL', 'IR ARGENTINA S.R.L'),
  ('JMV S.R.L.', 'JMV S.R.L'),
  ('JMV SRL', 'JMV S.R.L'),
  ('JVM S.R.L', 'JMV S.R.L'),
  ('LANCIONI SRL', 'LANCIONI'),
  ('METAL NOET', 'METAL NOET S.R.L.'),
  ('MOLFINO GNOS S.A', 'MOLFINO HNOS S.A.'),
  ('MOLFINO HNOS S.A', 'MOLFINO HNOS S.A.'),
  ('MOLFINO HNOS S.A.S.', 'MOLFINO HNOS S.A.'),
  ('NOME TIRES S.R.L', 'NOME TIRES S.R.L.'),
  ('NOME TIRES SRL', 'NOME TIRES S.R.L.'),
  ('ORIENTAR S.A.S', 'ORIENTAR S.A.S.'),
  ('PAUNY S.A.', 'PAUNY SA'),
  ('PELLACANI S.R.L', 'PELLACANI S.R.L.'),
  ('PELLACANI SRL', 'PELLACANI S.R.L.'),
  ('PELLSCANI SRL', 'PELLACANI S.R.L.'),
  ('PERTRACK', 'PERTRAK'),
  ('PERTRAK S.A', 'PERTRAK'),
  ('PERTRAK S.A.', 'PERTRAK'),
  ('POLIFILM', 'POLIFILM S.A'),
  ('PRECONS', 'PRECONS S.R.L.'),
  ('PRECONS S.R.L', 'PRECONS S.R.L.'),
  ('PROCAR SRL', 'PROCAR S.R.L'),
  ('PUSHKENA TEXTIL SA', 'PUSHKENA TEXTIL S.A'),
  ('RDM - ABEA', 'RDM - ABEA S.A.'),
  ('RDM - CENA HNOS ARG', 'RDM - CENA HNOS'),
  ('RDM - FRONTERA LIVING', 'RDM - FRONTERA LIVING S.A.'),
  ('RDM - GOOD RESRT S.R.L.', 'RDM - GOOD REST S.R.L.'),
  ('RDM - MARCHIONATTI', 'RDM - MARCHIONATTI CARINA'),
  ('RDM - METAGRO S.R.L', 'RDM - METAGRO S.R.L.'),
  ('RDM - RITMA SRL', 'RDM - RITMA S.R.L.'),
  ('RINERO HERMANOS SRL', 'RINERO HERMANOS S.R.L'),
  ('RODADDOS SPORT', 'RODADOS SPORT SRL'),
  ('RODOLFO PAGLIAROLI E HIJOS SRL', 'RODOLFO PAGLIAROLI E HIJOS S.R.L.'),
  ('SCH COMERCILAS S.A.S.', 'SCH COMERCIAL S.A.S'),
  ('SERENA ENGRANAJES', 'SERENA ENGRANAJES SRL'),
  ('SOLDAAR', 'SOLDAR S.R.L.'),
  ('SOLDAR S.R,L.', 'SOLDAR S.R.L.'),
  ('STAAL SAS', 'STAAL S.A.S.'),
  ('TACOMA  ARGENTINA S.A.', 'TACOMA ARGENTINA S.R.L'),
  ('TACOMA ARGENTINA S.A', 'TACOMA ARGENTINA S.R.L'),
  ('TACOMA ARGENTINA SA', 'TACOMA ARGENTINA S.R.L'),
  ('TACOMA ARGETINA S.A.', 'TACOMA ARGENTINA S.R.L'),
  ('TECMIC S.R.L.', 'TECMIC S.R.L'),
  ('TECMIC SRL', 'TECMIC S.R.L'),
  ('TODO DIESEL', 'TODO DIESEL S.A.S'),
  ('TOOL SHOP', 'TOOL SHOP SRL'),
  ('Tool Shop S.R.L.', 'TOOL SHOP SRL'),
  ('TOOLING CORP', 'TOOLING CORP S.A'),
  ('TP', 'TP S.R.L.'),
  ('TP S.R.L', 'TP S.R.L.'),
  ('TP SRL', 'TP S.R.L.'),
  ('TTI SOLUTIONS', 'TTI SOLUTIONS S.A.S.'),
  ('TTI SOLUTIONS SAS', 'TTI SOLUTIONS S.A.S.'),
  ('VENTURI HNOS S.A CIF', 'VENTURI HNOS S.A'),
  ('VENTURI HNOS. SA CIF', 'VENTURI HNOS S.A'),
  ('VIDPIA SAICF', 'VIDPIA'),
  ('VMG S.A', 'VMG S.A.'),
  ('VULCANO', 'VULCANO S.A'),
  ('VULCANO S.A.', 'VULCANO S.A'),
  ('YEMEN', 'YEMEN S.A'),
  ('YEMEN SA', 'YEMEN S.A'),
  ('ZB ARGENTINA S.R.L', 'ZB ARGENTINA S.R.L.');

-- 2. Backup de TODAS las filas que se van a tocar (a)
create table if not exists _backfill_clientes_backup_20260707 as
select s.id,
       s.cliente                as cliente_old,
       s.sheet_raw->>'CLIENTE'  as sheet_raw_cliente_old,
       s.operativas             as operativas_old
from shipments s
where btrim(coalesce(s.cliente, '')) in (select variant from tmp_cliente_map)
   or (s.sheet_raw is not null
       and btrim(coalesce(s.sheet_raw->>'CLIENTE', '')) in (select variant from tmp_cliente_map))
   or (jsonb_typeof(s.operativas) = 'array' and exists (
         select 1 from jsonb_array_elements(s.operativas) e
         where btrim(coalesce(e->>'CLIENTE_OP', '')) in (select variant from tmp_cliente_map)));

-- 3. Columna cliente (b)
update shipments s
set cliente = m.canonico
from tmp_cliente_map m
where btrim(coalesce(s.cliente, '')) = m.variant;

-- 4. Espejo sheet_raw.CLIENTE (c)
update shipments s
set sheet_raw = jsonb_set(s.sheet_raw, '{CLIENTE}', to_jsonb(m.canonico))
from tmp_cliente_map m
where s.sheet_raw is not null
  and btrim(coalesce(s.sheet_raw->>'CLIENTE', '')) = m.variant;

-- 5. operativas[*].CLIENTE_OP (d) — reescribe el array elemento a elemento,
--    preservando el orden; solo filas con al menos un elemento a cambiar.
update shipments s
set operativas = (
  select jsonb_agg(
           case when mm.canonico is not null
                then jsonb_set(t.e, '{CLIENTE_OP}', to_jsonb(mm.canonico))
                else t.e end
           order by t.ord)
  from jsonb_array_elements(s.operativas) with ordinality as t(e, ord)
  left join tmp_cliente_map mm on btrim(coalesce(t.e->>'CLIENTE_OP', '')) = mm.variant
)
where jsonb_typeof(s.operativas) = 'array'
  and exists (
    select 1 from jsonb_array_elements(s.operativas) e
    join tmp_cliente_map m2 on btrim(coalesce(e->>'CLIENTE_OP', '')) = m2.variant);

commit;

-- Verificación sugerida (post-commit):
-- select count(*) from _backfill_clientes_backup_20260707;
-- select cliente, count(*) from shipments group by 1 order by 2 desc limit 30;
