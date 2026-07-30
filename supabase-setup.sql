-- ============================================================
-- CMR TURNOS — ESQUEMA MULTI-TENANT
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Planes de plataforma
create table if not exists platform_plans (
  id text primary key,
  nombre text not null,
  limite_profesionales integer, -- null = ilimitado
  max_professionals integer,    -- alias legado (mismo valor)
  precio numeric not null default 0
);

alter table platform_plans add column if not exists limite_profesionales integer;

insert into platform_plans (id, nombre, limite_profesionales, max_professionals, precio) values
  ('inicial',     'Inicial',     1,    1,    20000),
  ('profesional', 'Profesional', 3,    3,    35000),
  ('max',         'Max',         null, null, 60000)
on conflict (id) do update set
  nombre = excluded.nombre,
  limite_profesionales = excluded.limite_profesionales,
  max_professionals = excluded.max_professionals,
  precio = excluded.precio;

delete from platform_plans where id = 'estandar';

-- Negocios (antes clubs)
create table if not exists businesses (
  id bigserial primary key,
  slug text not null unique,
  nombre text not null,
  categoria text not null default 'otro',
  ciudad text,
  barrio text,
  direccion text,
  color_marca text default '#6366F1',
  logo_url text,
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
  plan text not null default 'inicial' references platform_plans(id),
  estado text not null default 'activo',
  estado_motivo text,
  creado_en text not null
);

-- Profesionales
create table if not exists professionals (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  especialidad text,
  matricula text,
  bio text,
  foto_url text,
  activo boolean not null default true
);

-- Trigger: no superar limite_profesionales del plan del negocio
create or replace function enforce_professional_plan_limit()
returns trigger
language plpgsql
as $$
declare
  plan_limite integer;
  activos integer;
begin
  if new.activo is distinct from true then
    return new;
  end if;

  select pp.limite_profesionales into plan_limite
  from businesses b
  join platform_plans pp on pp.id = b.plan
  where b.id = new.business_id;

  if plan_limite is null then
    return new; -- ilimitado
  end if;

  select count(*) into activos
  from professionals
  where business_id = new.business_id
    and activo = true
    and (TG_OP = 'INSERT' or id is distinct from new.id);

  if TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and (old.activo is distinct from true)) then
    if activos >= plan_limite then
      raise exception 'Límite de profesionales del plan alcanzado (%).', plan_limite
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_professional_plan_limit on professionals;
create trigger trg_professional_plan_limit
  before insert or update of activo on professionals
  for each row
  execute function enforce_professional_plan_limit();

-- Servicios del negocio
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

alter table services add column if not exists sena text not null default '0';

-- Relación N:N profesional ↔ servicio
create table if not exists professional_services (
  professional_id bigint not null references professionals(id) on delete cascade,
  service_id bigint not null references services(id) on delete cascade,
  business_id bigint not null references businesses(id) on delete cascade,
  primary key (professional_id, service_id)
);

create index if not exists idx_professional_services_biz on professional_services (business_id);
create index if not exists idx_professional_services_svc on professional_services (service_id);

-- Migrar vínculos legacy services.professional_id
insert into professional_services (professional_id, service_id, business_id)
select professional_id, id, business_id
from services
where professional_id is not null
on conflict do nothing;

-- Planes de cliente del negocio (paquetes de sesiones)
create table if not exists plans (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  sesiones integer not null default 1,
  precio text not null default '0',
  descripcion text default '',
  activo boolean not null default true
);

-- Caja del negocio: ingresos y gastos
create table if not exists movimientos (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  descripcion text not null default '',
  categoria text not null default 'Otros',
  monto numeric not null default 0,
  fecha text not null,
  appointment_id bigint,
  creado_en text not null
);

create index if not exists idx_movimientos_biz_fecha on movimientos (business_id, fecha);

-- Admin por negocio
create table if not exists business_admins (
  id bigserial primary key,
  business_id bigint not null unique references businesses(id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  password_salt_b text,
  password_hash_b text,
  actualizado_en text not null
);

create table if not exists admin_users (
  id bigserial primary key,
  username text not null unique,
  password_salt text not null,
  password_hash text not null,
  role text not null default 'super_admin',
  creado_en text not null
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

create index if not exists idx_appointments_business_fecha
  on appointments (business_id, fecha);

-- Vincular movimientos de caja a turnos (después de crear appointments)
alter table movimientos add column if not exists appointment_id bigint;
create index if not exists idx_movimientos_appointment on movimientos (appointment_id);

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

create table if not exists platform_payments (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  plan_id text not null references platform_plans(id),
  monto numeric not null default 0,
  comprobante_url text,
  creado_en text not null
);

create table if not exists solicitudes (
  id bigserial primary key,
  nombre text not null,
  slug text not null,
  categoria text not null default 'otro',
  ciudad text,
  barrio text,
  direccion text,
  whatsapp text not null,
  email text not null,
  comprobante_url text,
  plan text not null default 'inicial',
  estado text not null default 'pendiente',
  creado_en text not null
);

-- Datos de transferencia de la plataforma (alias CMR para cobro de planes)
create table if not exists platform_settings (
  key text primary key,
  value text not null default ''
);

alter table platform_plans disable row level security;
alter table businesses disable row level security;
alter table professionals disable row level security;
alter table services disable row level security;
alter table professional_services disable row level security;
alter table plans disable row level security;
-- IMPORTANTE: sin esto la caja no puede guardar (ni manual ni automática)
alter table movimientos disable row level security;
alter table business_admins disable row level security;
alter table admin_users disable row level security;
alter table appointments disable row level security;
alter table bloqueos disable row level security;
alter table bloqueos_recurrentes disable row level security;
alter table platform_payments disable row level security;
alter table solicitudes disable row level security;
alter table platform_settings disable row level security;

-- Localidades disponibles (gestionadas por superadmin)
create table if not exists localidades (
  id bigserial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  creado_en text not null
);
alter table localidades disable row level security;

-- Migración: segunda franja horaria (si la tabla ya existía)
alter table businesses add column if not exists hora_inicio_2 integer;
alter table businesses add column if not exists hora_fin_2 integer;
alter table businesses add column if not exists dias_atencion text not null default '1,2,3,4,5';
alter table businesses add column if not exists direccion text;
alter table solicitudes add column if not exists direccion text;
alter table professionals add column if not exists especialidad text;
alter table professionals add column if not exists matricula text;
alter table professionals add column if not exists bio text;
alter table professionals add column if not exists foto_url text;
alter table professionals add column if not exists hora_inicio integer;
alter table professionals add column if not exists hora_fin integer;
alter table professionals add column if not exists hora_inicio_2 integer;
alter table professionals add column if not exists hora_fin_2 integer;
alter table professionals add column if not exists dias_atencion text;
