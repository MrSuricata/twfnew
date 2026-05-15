-- Seed inicial Karausz: categorías + estilos + 6 piezas placeholder.

insert into categories (slug, name_es, name_en, name_pt, sort_order) values
  ('mobiliario', 'Mobiliario', 'Furniture', 'Mobiliário', 10),
  ('pintura', 'Pintura', 'Painting', 'Pintura', 20),
  ('escultura', 'Escultura', 'Sculpture', 'Escultura', 30),
  ('relojes', 'Relojes', 'Clocks', 'Relógios', 40),
  ('plata', 'Plata', 'Silver', 'Prata', 50),
  ('cristaleria', 'Cristalería', 'Crystal', 'Cristal', 60),
  ('alfombras', 'Alfombras', 'Rugs', 'Tapetes', 70)
on conflict (slug) do nothing;

insert into styles (slug, name_es, name_en, name_pt, sort_order) values
  ('luis-xv', 'Luis XV', 'Louis XV', 'Luís XV', 10),
  ('luis-xvi', 'Luis XVI', 'Louis XVI', 'Luís XVI', 20),
  ('art-nouveau', 'Art Nouveau', 'Art Nouveau', 'Art Nouveau', 30),
  ('art-deco', 'Art Decó', 'Art Deco', 'Art Déco', 40),
  ('biedermeier', 'Biedermeier', 'Biedermeier', 'Biedermeier', 50),
  ('colonial', 'Colonial', 'Colonial', 'Colonial', 60)
on conflict (slug) do nothing;

with c as (select id, slug from categories),
     s as (select id, slug from styles)
insert into items (slug, title_es, title_en, title_pt, description_es, category_id, style_id, era, dimensions, condition, price_visible, status, sort_order)
select v.slug, v.title_es, v.title_en, v.title_pt, v.description_es, c.id, s.id, v.era, v.dimensions, v.condition, false, 'available', v.sort_order
from (values
  ('comoda-luis-xv-nogal', 'Cómoda Luis XV en nogal', 'Louis XV walnut commode', 'Cômoda Luís XV em nogueira', 'Cómoda con tres cajones, herrajes originales en bronce.', 'mobiliario', 'luis-xv', 'Siglo XIX', '95 x 120 x 56 cm', 'Excelente, restaurada', 10),
  ('butaca-art-deco', 'Butaca Art Decó tapizada', 'Art Deco upholstered armchair', 'Poltrona Art Déco estofada', 'Butaca con estructura en caoba y tapizado vintage en velludo verde.', 'mobiliario', 'art-deco', '1930s', '78 x 72 x 80 cm', 'Buena, retapizar opcional', 20),
  ('reloj-pendulo-frances', 'Reloj de péndulo francés', 'French pendulum clock', 'Relógio de pêndulo francês', 'Reloj de chimenea con caja en bronce dorado y mármol.', 'relojes', 'luis-xvi', 'Siglo XIX', '55 x 32 x 18 cm', 'Funcionando, revisado', 30),
  ('juego-plata-te', 'Juego de té en plata', 'Silver tea set', 'Conjunto de chá em prata', 'Juego de cuatro piezas en plata 925 con grabados florales.', 'plata', 'art-nouveau', 'Principios siglo XX', 'Tetera 22 cm de alto', 'Excelente', 40),
  ('paisaje-rio-plata', 'Paisaje del Río de la Plata', 'River Plate landscape', 'Paisagem do Rio da Prata', 'Óleo sobre tela enmarcado, escuela uruguaya.', 'pintura', 'colonial', 'Mediados siglo XX', '60 x 90 cm con marco', 'Muy bueno', 50),
  ('alfombra-persa-tabriz', 'Alfombra persa Tabriz', 'Persian Tabriz rug', 'Tapete persa Tabriz', 'Alfombra tejida a mano en lana, motivos clásicos.', 'alfombras', 'colonial', 'Mediados siglo XX', '240 x 170 cm', 'Buena, leves desgastes', 60)
) as v(slug, title_es, title_en, title_pt, description_es, cat_slug, style_slug, era, dimensions, condition, sort_order)
join c on c.slug = v.cat_slug
join s on s.slug = v.style_slug
on conflict (slug) do nothing;
