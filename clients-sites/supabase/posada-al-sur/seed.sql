-- Seed Posada al Sur

insert into beds (slug, type, dorm_capacity, name_es, name_en, name_pt, base_price_uyu, amenities, sort_order)
values
  ('dorm-mixto-6', 'dorm', 6, 'Dormitorio mixto de 6 camas', 'Mixed dorm 6 beds', 'Dormitório misto 6 camas', 950,
   '{"WiFi","Locker","Desayuno incluido","Baño compartido"}', 10),
  ('dorm-mujeres-4', 'dorm', 4, 'Dormitorio mujeres 4 camas', 'Female dorm 4 beds', 'Dormitório feminino 4 camas', 1050,
   '{"WiFi","Locker","Desayuno incluido","Baño compartido"}', 20),
  ('private-doble', 'private', null, 'Habitación privada doble', 'Private double room', 'Quarto privado duplo', 2900,
   '{"WiFi","Desayuno incluido","Baño privado"}', 30),
  ('family-4', 'family', null, 'Habitación familiar para 4', 'Family room for 4', 'Quarto familiar para 4', 3800,
   '{"WiFi","Desayuno incluido","Baño privado","Cuna disponible"}', 40)
on conflict (slug) do nothing;

insert into workshops (slug, title_es, title_en, title_pt, description_es, date_time, duration_minutes, capacity, price_uyu, instructor)
values
  ('ceramica-introduccion', 'Cerámica · Introducción', 'Ceramics · Introduction', 'Cerâmica · Introdução',
   'Taller de cuatro horas: torno y técnicas básicas.', now() + interval '14 days', 240, 8, 1800, 'Lucía Estévez'),
  ('escritura-creativa', 'Escritura creativa', 'Creative writing', 'Escrita criativa',
   'Cuatro encuentros de dos horas para desarrollar un proyecto personal.', now() + interval '21 days', 120, 12, 3200, 'Pablo Sánchez'),
  ('batucada-uruguaya', 'Batucada uruguaya', 'Uruguayan candombe drumming', 'Candombe uruguaio',
   'Iniciación al candombe: piano, repique y chico.', now() + interval '7 days', 90, 15, 700, 'Comparsa La Pintada')
on conflict (slug) do nothing;

insert into city_tours (slug, title_es, title_en, title_pt, description_es, description_en, description_pt,
                       schedule_pattern, duration_minutes, capacity, price_uyu, languages)
values
  ('ciudad-vieja-pie', 'Ciudad Vieja a pie', 'Old town walking tour', 'Cidade Velha a pé',
   'Recorrido por los hitos patrimoniales de Ciudad Vieja con guía local.',
   'Walking tour through the historic landmarks of Old Town with a local guide.',
   'Caminhada pelos marcos históricos da Cidade Velha com guia local.',
   'Sábados y domingos 10:00', 180, 15, 600, '{es,en,pt}'),
  ('mercado-del-puerto', 'Mercado del Puerto', 'Port Market', 'Mercado do Porto',
   'Visita guiada al Mercado del Puerto: parrillas, historia y degustación.',
   'Guided visit to the Port Market: grills, history and tasting.',
   'Visita guiada ao Mercado do Porto: parrillas, história e degustação.',
   'Viernes 19:00', 120, 12, 950, '{es,en,pt}'),
  ('economia-social', 'Tour por la economía social', 'Social economy tour', 'Tour pela economia social',
   'Recorrido por cooperativas y emprendimientos solidarios de Montevideo.',
   'Tour through cooperatives and solidarity initiatives in Montevideo.',
   'Tour por cooperativas e iniciativas solidárias de Montevidéu.',
   'Miércoles 15:00', 150, 10, 800, '{es,en}')
on conflict (slug) do nothing;
