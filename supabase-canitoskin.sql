-- ============================================================
-- CANITO SKIN — Schema + seed (único SQL a ejecutar)
-- Proyecto: plataforma a medida (un solo negocio, sin multi-tenant)
-- Ejecutar entero en: Supabase → SQL Editor → Run
--
-- Después:
--   1. Storage → crear bucket "comprobantes" (público o con políticas
--      que permitan upload vía service key)
--   2. .env: SUPABASE_URL + SUPABASE_SERVICE_KEY
--   3. Admin: /admin — password inicial "admin123"
--      (cambiarla apenas entres)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tablas base
-- ------------------------------------------------------------

create table if not exists businesses (
  id bigserial primary key,
  slug text not null unique,
  nombre text not null,
  categoria text not null default 'estetica',
  ciudad text,
  barrio text,
  direccion text,
  color_marca text default '#5b5f51',
  logo_url text,
  about_image_url text,
  whatsapp text not null default '',
  transfer_alias text not null default '',
  transfer_cbu text not null default '',
  transfer_titular text not null default '',
  hora_inicio integer not null default 9,
  hora_fin integer not null default 20,
  hora_inicio_2 integer,
  hora_fin_2 integer,
  dias_atencion text not null default '1,2,3,4,5',
  precio text not null default '0',
  plan text not null default 'canito',
  estado text not null default 'activo',
  estado_motivo text,
  creado_en text not null
);

create table if not exists professionals (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  especialidad text,
  matricula text,
  bio text,
  foto_url text,
  activo boolean not null default true,
  hora_inicio integer,
  hora_fin integer,
  hora_inicio_2 integer,
  hora_fin_2 integer,
  dias_atencion text
);

create table if not exists services (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  descripcion text default '',
  duracion_min integer not null default 30,
  precio text not null default '0',
  sena text not null default '0',
  categoria text,
  activo boolean not null default true,
  professional_id bigint references professionals(id) on delete set null
);

create table if not exists professional_services (
  professional_id bigint not null references professionals(id) on delete cascade,
  service_id bigint not null references services(id) on delete cascade,
  business_id bigint not null references businesses(id) on delete cascade,
  primary key (professional_id, service_id)
);

create table if not exists plans (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  sesiones integer not null default 1,
  precio text not null default '0',
  descripcion text default '',
  activo boolean not null default true
);

create table if not exists appointments (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  service_id bigint references services(id) on delete set null,
  professional_id bigint references professionals(id) on delete set null,
  nombre text not null,
  telefono text not null,
  fecha text not null,
  hora_inicio text not null,
  hora_fin text not null,
  duracion_min integer not null default 30,
  estado text not null default 'pendiente',
  cancel_token text not null unique,
  comprobante_nombre_original text not null,
  comprobante_archivo text not null,
  comprobante_mimetype text not null,
  comprobante_size integer not null,
  creado_en text not null
);

create table if not exists movimientos (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  descripcion text not null default '',
  categoria text not null default 'Otros',
  monto numeric not null default 0,
  fecha text not null,
  appointment_id bigint,
  origen text,              -- 'turno' | 'venta_market' | 'manual'
  referencia_id bigint,     -- id turno o pedido
  creado_en text not null
);

create table if not exists business_admins (
  id bigserial primary key,
  business_id bigint not null unique references businesses(id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  password_salt_b text,
  password_hash_b text,
  actualizado_en text not null
);

create table if not exists bloqueos (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  professional_id bigint references professionals(id) on delete cascade,
  fecha text not null,
  horario text,
  horario_desde text,
  horario_hasta text,
  dia_completo boolean not null default false,
  motivo text not null default '',
  creado_en text not null
);

create table if not exists bloqueos_recurrentes (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  professional_id bigint references professionals(id) on delete cascade,
  dia_semana integer not null,
  horario_desde text,
  horario_hasta text,
  dia_completo boolean not null default false,
  motivo text not null default '',
  activo boolean not null default true,
  creado_en text not null
);

-- ------------------------------------------------------------
-- 2) Market + CRM + videos (Canito)
-- ------------------------------------------------------------

create table if not exists productos (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  descripcion text default '',
  precio_base numeric not null default 0,
  categoria text not null default 'General',
  stock integer,
  imagen_url text,
  destacado boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists promociones (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  producto_id bigint references productos(id) on delete cascade,
  categoria text,
  tipo_descuento text not null check (tipo_descuento in ('porcentaje', 'monto_fijo')),
  valor numeric not null,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promociones_target check (
    (producto_id is not null and categoria is null)
    or (producto_id is null and categoria is not null)
  )
);

create table if not exists pedidos (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'cancelado')),
  total numeric not null default 0,
  nombre text not null,
  telefono text not null,
  email text,
  entrega_tipo text not null default 'retiro'
    check (entrega_tipo in ('retiro', 'envio')),
  entrega_direccion text,
  notas text,
  comprobante_nombre_original text,
  comprobante_archivo text,
  comprobante_mimetype text,
  comprobante_size integer,
  created_at timestamptz not null default now()
);

create table if not exists pedido_items (
  id bigserial primary key,
  pedido_id bigint not null references pedidos(id) on delete cascade,
  producto_id bigint references productos(id) on delete set null,
  nombre text not null,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric not null
);

create table if not exists videos_landing (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  titulo text,
  url text not null,
  seccion text not null default 'hero',
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists client_notes (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  telefono text not null,
  nombre text,
  notas text not null default '',
  updated_at timestamptz not null default now(),
  unique (business_id, telefono)
);

-- Columnas extra si las tablas ya existían
alter table businesses add column if not exists direccion text;
alter table businesses add column if not exists hora_inicio_2 integer;
alter table businesses add column if not exists hora_fin_2 integer;
alter table businesses add column if not exists dias_atencion text;
alter table professionals add column if not exists especialidad text;
alter table professionals add column if not exists matricula text;
alter table professionals add column if not exists bio text;
alter table professionals add column if not exists foto_url text;
alter table professionals add column if not exists hora_inicio integer;
alter table professionals add column if not exists hora_fin integer;
alter table professionals add column if not exists hora_inicio_2 integer;
alter table professionals add column if not exists hora_fin_2 integer;
alter table professionals add column if not exists dias_atencion text;
alter table services add column if not exists sena text;
alter table services add column if not exists dias_atencion text;
alter table movimientos add column if not exists appointment_id bigint;
alter table movimientos add column if not exists origen text;
alter table movimientos add column if not exists referencia_id bigint;

-- Market: catálogo de productos propios + pedidos ("solicitud de compra",
-- confirmación manual). Si ya existían de una corrida anterior, estos
-- create table no hacen nada (IF NOT EXISTS); los alter agregan las
-- columnas nuevas de pago/comprobante sin tocar filas existentes.
create table if not exists productos (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  descripcion text,
  precio_base numeric not null default 0,
  categoria text,
  destacado boolean not null default false,
  stock integer,
  imagen_url text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists pedidos (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  telefono text not null,
  email text,
  entrega_tipo text not null check (entrega_tipo in ('retiro','envio')),
  entrega_direccion text,
  notas text,
  total numeric not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmado','cancelado')),
  pago_metodo text,
  comprobante_url text,
  creado_en timestamptz not null default now()
);
alter table pedidos add column if not exists pago_metodo text;
alter table pedidos add column if not exists comprobante_url text;

create table if not exists pedido_items (
  id bigserial primary key,
  pedido_id bigint not null references pedidos(id) on delete cascade,
  producto_id bigint,
  nombre text not null,
  cantidad integer not null,
  precio_unitario numeric not null
);
create index if not exists idx_pedidos_biz on pedidos (business_id, estado);
create index if not exists idx_pedido_items_pedido on pedido_items (pedido_id);

-- Contenido de la landing gestionable desde el admin (sección "Contenido"):
-- videos institucionales y galería "Pieles reales".
create table if not exists videos_landing (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  titulo text,
  url text not null,
  seccion text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_videos_landing_biz on videos_landing (business_id, activo, orden);

create table if not exists galeria_pieles (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  titulo text,
  imagen_url text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_galeria_pieles_biz on galeria_pieles (business_id, activo, orden);

-- Tablas legado de la plataforma multi-negocio Nexo (superadmin, marketplace,
-- suscripciones) — ya no las usa el server. Si vienen de una corrida vieja
-- del setup anterior, se pueden borrar a mano:
--   drop table if exists platform_payments;
--   drop table if exists solicitudes;
--   drop table if exists platform_plan_price_history;
--   drop table if exists platform_plans;
--   drop table if exists admin_users;
--   drop table if exists platform_settings;
--   drop table if exists localidades;

-- Índices
create index if not exists idx_appointments_business_fecha on appointments (business_id, fecha);
create index if not exists idx_movimientos_biz_fecha on movimientos (business_id, fecha);
create index if not exists idx_movimientos_appointment on movimientos (appointment_id);
create index if not exists idx_professional_services_biz on professional_services (business_id);
create index if not exists idx_productos_biz on productos (business_id, activo);
create index if not exists idx_productos_cat on productos (business_id, categoria);
create index if not exists idx_pedidos_biz on pedidos (business_id, created_at desc);
create index if not exists idx_videos_biz on videos_landing (business_id, seccion, orden);
create index if not exists idx_client_notes_tel on client_notes (business_id, telefono);

-- Auth a nivel Express (service key): desactivar RLS
alter table businesses disable row level security;
alter table professionals disable row level security;
alter table services disable row level security;
alter table professional_services disable row level security;
alter table plans disable row level security;
alter table appointments disable row level security;
alter table movimientos disable row level security;
alter table business_admins disable row level security;
alter table bloqueos disable row level security;
alter table bloqueos_recurrentes disable row level security;
alter table productos disable row level security;
alter table promociones disable row level security;
alter table pedidos disable row level security;
alter table pedido_items disable row level security;
alter table videos_landing disable row level security;
alter table client_notes disable row level security;

-- ------------------------------------------------------------
-- 3) Seed Canito Skin
-- ------------------------------------------------------------

-- Negocio único
insert into businesses (
  slug, nombre, categoria, ciudad, barrio, direccion, color_marca,
  whatsapp, transfer_alias, transfer_cbu, transfer_titular,
  hora_inicio, hora_fin, dias_atencion, precio, plan, estado, creado_en
)
values (
  'canito',
  'Canito Skin',
  'estetica',
  'San Nicolás de los Arroyos',
  'Centro',
  'Allurralde 314',
  '#5b5f51',
  '',
  '',
  '',
  'Canito Skin',
  9,
  20,
  '1,2,3,4,5',
  '0',
  'canito',
  'activo',
  now()::text
)
on conflict (slug) do update set
  nombre = excluded.nombre,
  categoria = excluded.categoria,
  ciudad = excluded.ciudad,
  barrio = excluded.barrio,
  direccion = excluded.direccion,
  color_marca = excluded.color_marca,
  plan = 'canito',
  estado = 'activo';

-- Admin password inicial: admin123 (scrypt, mismos params que el server)
-- CAMBIAR en cuanto puedas desde el panel.
insert into business_admins (
  business_id, password_salt, password_hash, actualizado_en
)
select b.id,
  '01010101010101010101010101010101',
  'c88fd92c16975b585a278a41d263f42c8adb1102d952ae380de0deb82f6b2e3a649f4384e83b858736d4cc1e19b12c1df4dfd7abfb0d919cadcd7f56eae342b4',
  now()::text
from businesses b
where b.slug = 'canito'
on conflict (business_id) do update set
  password_salt = excluded.password_salt,
  password_hash = excluded.password_hash,
  actualizado_en = excluded.actualizado_en;

-- Profesional inicial: Cande
insert into professionals (business_id, nombre, especialidad, activo)
select b.id, 'Cande', 'Estética facial / skincare', true
from businesses b
where b.slug = 'canito'
  and not exists (
    select 1 from professionals p
    where p.business_id = b.id and p.nombre = 'Cande'
  );

-- Servicios de prueba (piel)
insert into services (business_id, nombre, descripcion, duracion_min, precio, sena, categoria, activo)
select b.id, v.nombre, v.descripcion, v.duracion_min, v.precio, v.sena, v.categoria, true
from businesses b
cross join (values
  ('Limpieza facial profunda', 'Limpieza y renovación de la piel', 60, '15000', '5000', 'Faciales'),
  ('Extracciones', 'Extracciones controladas según tipo de piel', 45, '12000', '4000', 'Faciales'),
  ('Tratamiento pieles maduras', 'Protocolo de cuidado para pieles maduras', 75, '18000', '6000', 'Faciales')
) as v(nombre, descripcion, duracion_min, precio, sena, categoria)
where b.slug = 'canito'
  and not exists (
    select 1 from services s where s.business_id = b.id and s.nombre = v.nombre
  );

-- Vincular Cande a todos los servicios del negocio
insert into professional_services (professional_id, service_id, business_id)
select p.id, s.id, b.id
from businesses b
join professionals p on p.business_id = b.id and p.nombre = 'Cande'
join services s on s.business_id = b.id
where b.slug = 'canito'
on conflict do nothing;

-- Productos de prueba (línea Canito — sin campo marca)
insert into productos (business_id, nombre, descripcion, precio_base, categoria, stock, destacado, activo)
select b.id, v.nombre, v.descripcion, v.precio_base, v.categoria, v.stock, v.destacado, true
from businesses b
cross join (values
  ('Crema hidratante Canito', 'Hidratación diaria para todo tipo de piel', 18500::numeric, 'Cuidado diario', 20, true),
  ('Sérum renovador', 'Sérum de noche para luminosidad', 22000::numeric, 'Sérums', 15, true),
  ('Protector solar facial', 'Protección diaria UVA/UVB', 16000::numeric, 'Cuidado diario', 25, false)
) as v(nombre, descripcion, precio_base, categoria, stock, destacado)
where b.slug = 'canito'
  and not exists (
    select 1 from productos p where p.business_id = b.id and p.nombre = v.nombre
  );

-- Listo
select
  b.id as business_id,
  b.slug,
  b.nombre,
  b.direccion,
  b.color_marca,
  (select count(*) from professionals p where p.business_id = b.id) as profesionales,
  (select count(*) from services s where s.business_id = b.id) as servicios,
  (select count(*) from productos pr where pr.business_id = b.id) as productos
from businesses b
where b.slug = 'canito';
