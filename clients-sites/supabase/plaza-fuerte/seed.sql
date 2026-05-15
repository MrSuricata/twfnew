-- Seed mínimo de habitaciones placeholder para Plaza Fuerte.
-- En producción el admin carga las 15 habitaciones reales.

insert into rooms (slug, name_es, name_en, name_pt, type, capacity, has_port_view, base_price_uyu, size_m2, amenities, sort_order)
values
  ('classic-single', 'Habitación clásica individual', 'Classic single room', 'Quarto clássico individual', 'single', 1, false, 3800, 14,
   '{"WiFi","Aire acondicionado","Caja de seguridad","Desayuno incluido"}', 10),
  ('classic-double', 'Habitación clásica doble', 'Classic double room', 'Quarto clássico duplo', 'double', 2, false, 5200, 18,
   '{"WiFi","Aire acondicionado","Caja de seguridad","Desayuno incluido","Smart TV"}', 20),
  ('superior-port', 'Superior con vista al puerto', 'Superior with port view', 'Superior com vista para o porto', 'double', 2, true, 7900, 22,
   '{"WiFi","Aire acondicionado","Caja de seguridad","Desayuno incluido","Smart TV","Mini bar"}', 30),
  ('junior-suite', 'Junior Suite', 'Junior Suite', 'Junior Suite', 'suite', 2, true, 9800, 28,
   '{"WiFi","Aire acondicionado","Caja de seguridad","Desayuno incluido","Smart TV","Mini bar","Sala de estar"}', 40),
  ('family', 'Habitación familiar', 'Family room', 'Quarto familiar', 'family', 4, false, 8500, 32,
   '{"WiFi","Aire acondicionado","Caja de seguridad","Desayuno incluido","Smart TV","Cuna disponible"}', 50)
on conflict (slug) do nothing;

insert into events (slug, name_es, name_en, name_pt, description_es, capacity, sort_order)
values
  ('salon-puerto', 'Salón Puerto', 'Port Hall', 'Salão Porto', 'Salón principal con vista al puerto. Hasta 80 personas para corporativos y casamientos íntimos.', 80, 10),
  ('salon-patrimonial', 'Salón Patrimonial', 'Heritage Hall', 'Salão Patrimonial', 'Salón con cornisas y mosaicos originales 1913. Ideal cenas de gala.', 40, 20),
  ('business-center', 'Business Center', 'Business Center', 'Business Center', 'Reuniones ejecutivas hasta 12 personas con pantalla 4K.', 12, 30)
on conflict (slug) do nothing;
