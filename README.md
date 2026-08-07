# Canito Skin — plataforma de turnos y market

Plataforma a medida para Canito Skin (San Nicolás de los Arroyos): reserva de
turnos con varios profesionales y catálogo de la línea propia de skincare.
Negocio único, sin multi-tenant.

## Stack

- Backend: Node.js + Express (`server/index.js`)
- Frontend: HTML, CSS, JavaScript vanilla (`public/`), Tailwind vía CDN (sin build)
- Base de datos: Supabase (Postgres), con SQLite local como fallback de desarrollo
- Subida de comprobantes: `multer`, guardados en Supabase Storage (bucket `comprobantes`)
- Deploy: Vercel (`vercel.json`, función serverless única sobre `server/index.js`)

## Estructura

- `public/` → frontend (landing + wizard de reserva en `index.html`, panel admin en `admin.html`)
- `server/index.js` → API Express (turnos, profesionales, servicios, movimientos, productos)
- `supabase-canitoskin.sql` → schema completo de Supabase (turnos + market/CRM/videos)
- `docs/` → Términos y Política de Privacidad (⚠️ ver nota abajo)

## Instalación

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear `.env` (copiar desde `.env.example`) con las credenciales reales de
   Supabase, WhatsApp y admin. Si el proyecto está vinculado a Vercel, `vercel
   env pull .env.local` trae las variables de producción/preview — el server
   carga `.env` y después `.env.local` (que pisa lo anterior si existe).

3. Ejecutar `supabase-canitoskin.sql` completo en el SQL Editor de tu proyecto
   de Supabase antes de arrancar (crea tablas, RLS y seed del negocio "canito").

4. Iniciar servidor:

   ```bash
   npm start
   ```

5. Abrir en el navegador: [http://localhost:3000](http://localhost:3000)

## API pública (prefijo `/api/:slug/...`, slug fijo: `canito`)

- `GET /config` — datos del negocio, servicios, profesionales, planes
- `GET /disponibilidad`, `GET /bloqueos` — horarios disponibles
- `GET /productos-destacados` — preview de productos para la landing
- `POST /reservas` — crear turno (multipart, con comprobante)
- `GET /mis-reservas`, `POST /cancelar/:token` — gestión de turnos por teléfono

### Panel administrador

- URL: `/admin`
- Login con `ADMIN_PASSWORD`
- Secciones: Agenda, Servicios, Equipo, Clientes, Planes, Movimientos, Estadísticas, Configuración

## ⚠️ Pendiente: Términos y Política de Privacidad

`docs/TERMINOS-Y-CONDICIONES.md` y `docs/POLITICA-DE-PRIVACIDAD.md` todavía
describen el modelo **multi-tenant** de la plataforma anterior (CMR Nexo):
"negocio usuario" vs. "cliente final", CMR como responsable/encargado del
tratamiento de datos de terceros, suscripciones, aislamiento multi-tenant,
etc. Ese modelo ya no existe — Canito Skin es un único negocio con relación
directa con sus clientes. Estos documentos necesitan una reescritura legal
sustantiva (no solo cambiar el nombre de marca) antes de considerarse
vigentes para Canito Skin.
