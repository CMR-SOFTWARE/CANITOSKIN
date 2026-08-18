const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
// .env.local (ej: generado por `vercel env pull`) pisa lo de .env si existe.
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const express = require("express");
const multer = require("multer");
const fs = require("fs/promises");
const fsSync = require("fs");
const crypto = require("crypto");

let sqlite3 = null;
try { sqlite3 = require("sqlite3").verbose(); } catch (_) { sqlite3 = null; }
let supabase = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
} catch (_) { supabase = null; }

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, "..");
const IS_VERCEL = process.env.VERCEL === "1";
const DATA_DIR = IS_VERCEL ? path.join("/tmp", "cmr-turnos-data") : ROOT_DIR;
const DB_FILE = process.env.SQLITE_PATH || path.join(DATA_DIR, "turnos.sqlite");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "cambia_esta_clave";
if (!process.env.ADMIN_SESSION_SECRET) {
  console.warn("[security] ADVERTENCIA: ADMIN_SESSION_SECRET no configurado — los tokens admin son predecibles. Configuralo en .env");
}
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_SCRYPT_KEYLEN = 64;
const ADMIN_SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const USE_SUPABASE = Boolean(supabase);
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "comprobantes";
const USE_SQLITE = !USE_SUPABASE && Boolean(sqlite3);

const SLOT_STEP_MIN = 15;
const MAX_VIDEOS_LANDING = 4;
const MAX_GALERIA_FOTOS = 4;
const CATEGORIAS = new Set(["estetica"]);
const ESTADOS_TURNO = new Set(["pendiente", "confirmada", "cancelada"]);

const DEFAULT_BUSINESS_SLUG = (process.env.BUSINESS_SLUG || "canito").toLowerCase().replace(/[^a-z0-9-]/g, "-");
const DEFAULT_BUSINESS_NOMBRE = process.env.BUSINESS_NOMBRE || "Canito Skin";
const DEFAULT_BUSINESS_CATEGORIA = CATEGORIAS.has(process.env.BUSINESS_CATEGORIA)
  ? process.env.BUSINESS_CATEGORIA
  : "estetica";
const DEFAULT_BUSINESS_CIUDAD = process.env.BUSINESS_CIUDAD || "San Nicolás de los Arroyos";
const DEFAULT_BUSINESS_BARRIO = process.env.BUSINESS_BARRIO || "Centro";
const DEFAULT_BUSINESS_DIRECCION = process.env.BUSINESS_DIRECCION || "Allurralde 314";
const DEFAULT_BUSINESS_COLOR = process.env.BUSINESS_COLOR_MARCA || "#5b5f51";
const DEFAULT_BUSINESS_HORA_INICIO = parseInt(process.env.BUSINESS_HORA_INICIO || "9", 10);
const DEFAULT_BUSINESS_HORA_FIN = parseInt(process.env.BUSINESS_HORA_FIN || "20", 10);
const DEFAULT_BUSINESS_PRECIO = process.env.BUSINESS_PRECIO || "0";
const DEFAULT_BUSINESS_WHATSAPP = (process.env.WHATSAPP_NUMERO || "5491112345678").replace(/\D/g, "");
const DEFAULT_BUSINESS_ALIAS = process.env.TRANSFER_ALIAS || "mi.alias";
const DEFAULT_BUSINESS_CBU = process.env.TRANSFER_CBU || "0000000000000000000000";
const DEFAULT_BUSINESS_TITULAR = process.env.TRANSFER_TITULAR || "Canito Skin";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const CATEGORIA_LABELS = {
  estetica: "Estética",
};

const LOGOS_DIR = path.join(UPLOADS_DIR, "logos");
if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });
if (!fsSync.existsSync(UPLOADS_DIR)) fsSync.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fsSync.existsSync(LOGOS_DIR)) fsSync.mkdirSync(LOGOS_DIR, { recursive: true });

async function uploadBusinessLogoFile(businessId, file) {
  const ext = path.extname(file.originalname) || ".jpg";
  const filename = `${businessId}_${Date.now()}${ext}`;

  if (USE_SQLITE) {
    await fs.mkdir(LOGOS_DIR, { recursive: true });
    await fs.writeFile(path.join(LOGOS_DIR, filename), file.buffer);
    const logoUrl = `/uploads/logos/${filename}`;
    await dbRun("UPDATE businesses SET logo_url = ? WHERE id = ?", [logoUrl, businessId]);
    return logoUrl;
  }
  if (USE_SUPABASE) {
    const storagePath = `logos/${filename}`;
    const { error: uploadErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);
    const { data: { publicUrl } } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);
    const { error } = await supabase.from("businesses").update({ logo_url: publicUrl }).eq("id", businessId);
    if (error) throw new Error(error.message);
    return publicUrl;
  }
  throw new Error("No hay backend disponible.");
}

async function uploadBusinessAboutImageFile(businessId, file) {
  const ext = path.extname(file.originalname) || ".jpg";
  const filename = `${businessId}_${Date.now()}${ext}`;

  if (USE_SQLITE) {
    await fs.mkdir(LOGOS_DIR, { recursive: true });
    await fs.writeFile(path.join(LOGOS_DIR, filename), file.buffer);
    const aboutImageUrl = `/uploads/logos/${filename}`;
    await dbRun("UPDATE businesses SET about_image_url = ? WHERE id = ?", [aboutImageUrl, businessId]);
    return aboutImageUrl;
  }
  if (USE_SUPABASE) {
    const storagePath = `about/${filename}`;
    const { error: uploadErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);
    const { data: { publicUrl } } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);
    const { error } = await supabase.from("businesses").update({ about_image_url: publicUrl }).eq("id", businessId);
    if (error) throw new Error(error.message);
    return publicUrl;
  }
  throw new Error("No hay backend disponible.");
}

async function uploadProfessionalFotoFile(businessId, professionalId, file) {
  const ext = path.extname(file.originalname) || ".jpg";
  const filename = `pro_${businessId}_${professionalId}_${Date.now()}${ext}`;

  if (USE_SQLITE) {
    await fs.mkdir(LOGOS_DIR, { recursive: true });
    await fs.writeFile(path.join(LOGOS_DIR, filename), file.buffer);
    const fotoUrl = `/uploads/logos/${filename}`;
    await dbRun(
      "UPDATE professionals SET foto_url = ? WHERE id = ? AND business_id = ?",
      [fotoUrl, professionalId, businessId]
    );
    return fotoUrl;
  }
  if (USE_SUPABASE) {
    const storagePath = `professionals/${filename}`;
    const { error: uploadErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);
    const { data: { publicUrl } } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);
    const { error } = await supabase
      .from("professionals")
      .update({ foto_url: publicUrl })
      .eq("id", professionalId)
      .eq("business_id", businessId);
    if (error) throw new Error(error.message);
    return publicUrl;
  }
  throw new Error("No hay backend disponible.");
}

async function uploadGaleriaFotoFile(businessId, galeriaId, file) {
  const ext = path.extname(file.originalname) || ".jpg";
  const filename = `galeria_${businessId}_${galeriaId}_${Date.now()}${ext}`;
  const storagePath = `galeria/${filename}`;
  const { error: uploadErr } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
  if (uploadErr) throw new Error(uploadErr.message);
  const { data: { publicUrl } } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);
  return publicUrl;
}

async function removeGaleriaFotoFile(imagenUrl) {
  if (!imagenUrl) return;
  const marker = `/storage/v1/object/public/${SUPABASE_BUCKET}/`;
  const idx = imagenUrl.indexOf(marker);
  if (idx === -1) return;
  const storagePath = imagenUrl.slice(idx + marker.length);
  await supabase.storage.from(SUPABASE_BUCKET).remove([storagePath]).catch(() => {});
}

// Devuelve true si el error de Supabase es "la tabla no existe" (42P01) —
// pasa mientras no se corrió la migración de videos_landing/galeria_pieles.
function isMissingTableError(error) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202") return true;
  return /could not find the table|schema cache|does not exist/i.test(error.message || "");
}

// Evita dos videos con el mismo "orden" (se superpondrían en el reel).
// Si ya hay otro video con ese orden: si el que se está moviendo tenía
// una posición previa, se la cede (swap prolijo); si es nuevo, el que
// estaba ahí pasa al final.
async function resolverColisionOrdenVideo(businessId, videoId, ordenDeseado, ordenAnterior) {
  const { data: colision } = await supabase.from("videos_landing")
    .select("id, orden")
    .eq("business_id", businessId)
    .eq("orden", ordenDeseado)
    .neq("id", videoId ?? -1)
    .maybeSingle();
  if (!colision) return;

  if (ordenAnterior != null && ordenAnterior !== ordenDeseado) {
    await supabase.from("videos_landing").update({ orden: ordenAnterior }).eq("id", colision.id);
    return;
  }
  const { data: maxRow } = await supabase.from("videos_landing")
    .select("orden").eq("business_id", businessId).order("orden", { ascending: false }).limit(1).maybeSingle();
  const ordenFinal = (maxRow?.orden ?? 0) + 1;
  await supabase.from("videos_landing").update({ orden: ordenFinal }).eq("id", colision.id);
}

function mapVideoRow(row) {
  return {
    id: row.id,
    titulo: row.titulo || null,
    url: row.url,
    seccion: row.seccion || null,
    orden: row.orden ?? 0,
    activo: row.activo !== false,
  };
}

function mapGaleriaRow(row) {
  return {
    id: row.id,
    titulo: row.titulo || null,
    imagenUrl: row.imagen_url,
    orden: row.orden ?? 0,
    activo: row.activo !== false,
  };
}

function parseProfessionalProfile(body = {}) {
  const nombre = String(body.nombre || "").trim();
  const especialidad = String(body.especialidad || "").trim().slice(0, 80) || null;
  const matricula = String(body.matricula || "").trim().slice(0, 60) || null;
  const bio = String(body.bio || "").trim().slice(0, 400) || null;
  return { nombre, especialidad, matricula, bio };
}

/** Horario propio del profesional. horarioPropio=false → hereda el del negocio (nulls). */
function parseProfessionalSchedule(body = {}) {
  const propio =
    body.horarioPropio === true ||
    body.horarioPropio === "true" ||
    body.horarioPropio === 1 ||
    body.horarioPropio === "1";
  if (!propio) {
    return {
      horarioPropio: false,
      horaInicio: null,
      horaFin: null,
      horaInicio2: null,
      horaFin2: null,
      diasAtencionCsv: null,
    };
  }
  const horaInicio = scheduleValueToMinutes(body.horaInicio);
  const horaFin = scheduleValueToMinutes(body.horaFin);
  if (!Number.isFinite(horaInicio) || !Number.isFinite(horaFin) || horaInicio >= horaFin) {
    const err = new Error("Horario inválido: Desde debe ser menor que Hasta.");
    err.status = 400;
    throw err;
  }
  let horaInicio2 = null;
  let horaFin2 = null;
  const rawI2 = body.horaInicio2;
  const rawF2 = body.horaFin2;
  if (rawI2 !== "" && rawI2 != null && rawF2 !== "" && rawF2 != null) {
    horaInicio2 = scheduleValueToMinutes(rawI2);
    horaFin2 = scheduleValueToMinutes(rawF2);
    if (!Number.isFinite(horaInicio2) || !Number.isFinite(horaFin2) || horaInicio2 >= horaFin2) {
      const err = new Error("Franja 2 inválida.");
      err.status = 400;
      throw err;
    }
    if (horaInicio2 < horaFin) {
      const err = new Error("La franja 2 debe empezar después de que termine la franja 1.");
      err.status = 400;
      throw err;
    }
  }
  return {
    horarioPropio: true,
    horaInicio,
    horaFin,
    horaInicio2,
    horaFin2,
    diasAtencionCsv: serializeDiasAtencion(body.diasAtencion),
  };
}

function findProfessional(business, professionalId) {
  if (professionalId == null || professionalId === "") return null;
  const pid = Number(professionalId);
  if (!Number.isFinite(pid)) return null;
  return (business.professionals || []).find((p) => Number(p.id) === pid) || null;
}

function professionalHasOwnSchedule(pro) {
  if (!pro) return false;
  const a = scheduleValueToMinutes(pro.horaInicio);
  const b = scheduleValueToMinutes(pro.horaFin);
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

/** Horario efectivo: propio del profesional o, si no tiene, el del negocio. */
function effectiveSchedule(business, pro) {
  const baseDays = Array.isArray(business.diasAtencion)
    ? business.diasAtencion
    : parseDiasAtencion(business.dias_atencion ?? business.diasAtencion);
  const base = {
    horaInicio: business.horaInicio,
    horaFin: business.horaFin,
    horaInicio2: business.horaInicio2 ?? null,
    horaFin2: business.horaFin2 ?? null,
    diasAtencion: baseDays,
  };
  if (!pro) return base;

  const hasDays =
    pro.diasAtencion != null &&
    (Array.isArray(pro.diasAtencion)
      ? pro.diasAtencion.length > 0
      : String(pro.diasAtencion).trim() !== "");

  if (!professionalHasOwnSchedule(pro)) {
    if (hasDays) return { ...base, diasAtencion: parseDiasAtencion(pro.diasAtencion) };
    return base;
  }

  return {
    horaInicio: pro.horaInicio,
    horaFin: pro.horaFin,
    horaInicio2: pro.horaInicio2 != null && pro.horaInicio2 !== "" ? pro.horaInicio2 : null,
    horaFin2: pro.horaFin2 != null && pro.horaFin2 !== "" ? pro.horaFin2 : null,
    diasAtencion: hasDays ? parseDiasAtencion(pro.diasAtencion) : baseDays,
  };
}

// Canito Skin: un solo negocio, sin límite de profesionales por plan.
async function getMaxProfessionals(_planId) {
  return Number.POSITIVE_INFINITY;
}

// ============================================================
// RATE LIMITING
// ============================================================
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0].trim();
}

function checkLoginRateLimit(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function resetLoginRateLimit(key) {
  loginAttempts.delete(key);
}

function timingSafeEqualString(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(Buffer.alloc(bufB.length), bufB);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_) { return false; }
}

async function validateFileMagicBytes(file) {
  let buf = file.buffer;
  if (!buf && file.path) buf = await fs.readFile(file.path).catch(() => null);
  if (!buf || buf.length < 8) return false;
  const mime = file.mimetype;
  if (mime === "image/jpeg") return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (mime === "image/png")  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (mime === "image/webp") return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
  if (mime === "application/pdf") return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  return false;
}

const db = USE_SQLITE ? new sqlite3.Database(DB_FILE) : null;

// ============================================================
// DB HELPERS
// ============================================================
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) { reject(error); return; }
      resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) { reject(error); return; }
      resolve(rows);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) { reject(error); return; }
      resolve(row || null);
    });
  });
}

// ============================================================
// SCHEMA INIT (SQLite)
// ============================================================
async function initDb() {
  if (!USE_SQLITE) return;

  await dbRun(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'estetica',
      ciudad TEXT,
      barrio TEXT,
      direccion TEXT,
      color_marca TEXT DEFAULT '#5b5f51',
      logo_url TEXT,
      about_image_url TEXT,
      whatsapp TEXT NOT NULL DEFAULT '',
      transfer_alias TEXT NOT NULL DEFAULT '',
      transfer_cbu TEXT NOT NULL DEFAULT '',
      transfer_titular TEXT NOT NULL DEFAULT '',
      hora_inicio INTEGER NOT NULL DEFAULT 9,
      hora_fin INTEGER NOT NULL DEFAULT 20,
      hora_inicio_2 INTEGER,
      hora_fin_2 INTEGER,
      dias_atencion TEXT NOT NULL DEFAULT '1,2,3,4,5',
      precio TEXT NOT NULL DEFAULT '0',
      plan TEXT NOT NULL DEFAULT 'canito',
      estado TEXT NOT NULL DEFAULT 'activo',
      estado_motivo TEXT,
      creado_en TEXT NOT NULL
    )
  `);
  try {
    const bizCols = await dbAll("PRAGMA table_info(businesses)");
    const bizNames = new Set(bizCols.map((c) => c.name));
    if (!bizNames.has("about_image_url")) await dbRun("ALTER TABLE businesses ADD COLUMN about_image_url TEXT");
    if (!bizNames.has("hora_inicio_2")) await dbRun("ALTER TABLE businesses ADD COLUMN hora_inicio_2 INTEGER");
    if (!bizNames.has("hora_fin_2")) await dbRun("ALTER TABLE businesses ADD COLUMN hora_fin_2 INTEGER");
    if (!bizNames.has("dias_atencion")) {
      await dbRun("ALTER TABLE businesses ADD COLUMN dias_atencion TEXT NOT NULL DEFAULT '1,2,3,4,5'");
    }
    if (!bizNames.has("direccion")) await dbRun("ALTER TABLE businesses ADD COLUMN direccion TEXT");
  } catch (_) { /* ignore */ }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS professionals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      especialidad TEXT,
      matricula TEXT,
      bio TEXT,
      foto_url TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);
  try {
    const proCols = await dbAll("PRAGMA table_info(professionals)");
    const proNames = new Set(proCols.map((c) => c.name));
    if (!proNames.has("especialidad")) await dbRun("ALTER TABLE professionals ADD COLUMN especialidad TEXT");
    if (!proNames.has("matricula")) await dbRun("ALTER TABLE professionals ADD COLUMN matricula TEXT");
    if (!proNames.has("bio")) await dbRun("ALTER TABLE professionals ADD COLUMN bio TEXT");
    if (!proNames.has("foto_url")) await dbRun("ALTER TABLE professionals ADD COLUMN foto_url TEXT");
    if (!proNames.has("hora_inicio")) await dbRun("ALTER TABLE professionals ADD COLUMN hora_inicio INTEGER");
    if (!proNames.has("hora_fin")) await dbRun("ALTER TABLE professionals ADD COLUMN hora_fin INTEGER");
    if (!proNames.has("hora_inicio_2")) await dbRun("ALTER TABLE professionals ADD COLUMN hora_inicio_2 INTEGER");
    if (!proNames.has("hora_fin_2")) await dbRun("ALTER TABLE professionals ADD COLUMN hora_fin_2 INTEGER");
    if (!proNames.has("dias_atencion")) await dbRun("ALTER TABLE professionals ADD COLUMN dias_atencion TEXT");
  } catch (_) { /* ignore */ }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS professional_services (
      professional_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      PRIMARY KEY (professional_id, service_id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )
  `);
  try {
    // Migrar vínculos legacy services.professional_id → professional_services
    const legacy = await dbAll(
      `SELECT id AS service_id, professional_id, business_id FROM services
       WHERE professional_id IS NOT NULL`
    );
    for (const row of legacy) {
      await dbRun(
        `INSERT OR IGNORE INTO professional_services (professional_id, service_id, business_id)
         VALUES (?, ?, ?)`,
        [row.professional_id, row.service_id, row.business_id]
      );
    }
  } catch (_) { /* ignore */ }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      duracion_min INTEGER NOT NULL DEFAULT 30,
      precio TEXT NOT NULL DEFAULT '0',
      sena TEXT NOT NULL DEFAULT '0',
      categoria TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      professional_id INTEGER,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    )
  `);
  try {
    const svcCols = await dbAll("PRAGMA table_info(services)");
    const svcNames = new Set(svcCols.map((c) => c.name));
    if (!svcNames.has("sena")) await dbRun("ALTER TABLE services ADD COLUMN sena TEXT NOT NULL DEFAULT '0'");
    if (!svcNames.has("dias_atencion")) await dbRun("ALTER TABLE services ADD COLUMN dias_atencion TEXT");
  } catch (_) { /* ignore */ }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      sesiones INTEGER NOT NULL DEFAULT 1,
      precio TEXT NOT NULL DEFAULT '0',
      descripcion TEXT DEFAULT '',
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      categoria TEXT NOT NULL DEFAULT 'Otros',
      monto REAL NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL,
      appointment_id INTEGER,
      creado_en TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);
  try {
    const movCols = await dbAll("PRAGMA table_info(movimientos)");
    const movNames = new Set(movCols.map((c) => c.name));
    if (!movNames.has("appointment_id")) {
      await dbRun("ALTER TABLE movimientos ADD COLUMN appointment_id INTEGER");
    }
  } catch (_) { /* ignore */ }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS business_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt_b TEXT,
      password_hash_b TEXT,
      password_vault TEXT,
      actualizado_en TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);
  try {
    const adminCols = await dbAll("PRAGMA table_info(business_admins)");
    if (!adminCols.some((c) => c.name === "password_vault")) {
      await dbRun("ALTER TABLE business_admins ADD COLUMN password_vault TEXT");
    }
  } catch (_) { /* ignore */ }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      service_id INTEGER,
      professional_id INTEGER,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      fecha TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL,
      duracion_min INTEGER NOT NULL DEFAULT 30,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      cancel_token TEXT NOT NULL UNIQUE,
      comprobante_nombre_original TEXT NOT NULL,
      comprobante_archivo TEXT NOT NULL,
      comprobante_mimetype TEXT NOT NULL,
      comprobante_size INTEGER NOT NULL,
      creado_en TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS bloqueos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      professional_id INTEGER,
      fecha TEXT NOT NULL,
      horario TEXT,
      horario_desde TEXT,
      horario_hasta TEXT,
      dia_completo INTEGER NOT NULL DEFAULT 0,
      motivo TEXT NOT NULL DEFAULT '',
      creado_en TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS bloqueos_recurrentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      professional_id INTEGER,
      dia_semana INTEGER NOT NULL,
      horario_desde TEXT,
      horario_hasta TEXT,
      dia_completo INTEGER NOT NULL DEFAULT 0,
      motivo TEXT NOT NULL DEFAULT '',
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    )
  `);

  await dbRun("CREATE INDEX IF NOT EXISTS idx_appointments_biz_fecha ON appointments (business_id, fecha)");
  await dbRun("CREATE INDEX IF NOT EXISTS idx_appointments_cancel ON appointments (cancel_token)");
  await dbRun("CREATE INDEX IF NOT EXISTS idx_movimientos_biz_fecha ON movimientos (business_id, fecha)");
  await dbRun("CREATE INDEX IF NOT EXISTS idx_movimientos_appointment ON movimientos (appointment_id)");
}

// ============================================================
// AUTH HELPERS
// ============================================================
function hashAdminPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, ADMIN_SCRYPT_KEYLEN, ADMIN_SCRYPT_OPTS).toString("hex");
  return { salt, hash };
}

function verifyAdminPasswordScrypt(plain, salt, hashHex) {
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(plain, salt, expected.length, ADMIN_SCRYPT_OPTS);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_) { return false; }
}

function verifyAdminRowPasswords(plain, row) {
  if (!row) return false;
  if (verifyAdminPasswordScrypt(plain, row.password_salt, row.password_hash)) return true;
  if (row.password_salt_b && row.password_hash_b &&
      verifyAdminPasswordScrypt(plain, row.password_salt_b, row.password_hash_b)) return true;
  return false;
}

function generateCancelToken() {
  return crypto.randomBytes(24).toString("hex");
}

/** Token payload usa businessId; el campo se llama clubId por compatibilidad de sesión HMAC. */
function createAdminSession(businessId) {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  const payload = `${businessId}:${expiresAt}`;
  const signature = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function parseAdminToken(token) {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = token.substring(0, lastDot);
  const providedSig = token.substring(lastDot + 1);
  const expectedSig = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("hex");
  if (!timingSafeEqualString(providedSig, expectedSig)) return null;
  const colonIdx = payload.indexOf(":");
  if (colonIdx === -1) return null;
  const clubId = Number(payload.substring(0, colonIdx));
  const expiresAt = Number(payload.substring(colonIdx + 1));
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return { clubId, businessId: clubId };
}

async function verifyAdminPasswordForBusiness(plain, businessId) {
  if (USE_SQLITE) {
    const row = await dbGet("SELECT * FROM business_admins WHERE business_id = ? LIMIT 1", [businessId]);
    return row ? verifyAdminRowPasswords(plain, row) : false;
  }
  if (USE_SUPABASE) {
    const { data } = await supabase.from("business_admins").select("*").eq("business_id", businessId).maybeSingle();
    return data ? verifyAdminRowPasswords(plain, data) : false;
  }
  return false;
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" ");
  const parsed = parseAdminToken(token);
  if (!parsed || parsed.businessId !== req.business.id) {
    return res.status(401).json({ error: "No autorizado." });
  }
  return next();
}

// ============================================================
// TIME / AVAILABILITY ENGINE
// ============================================================
function timeToMinutes(hhmm) {
  if (!hhmm) return null;
  const s = String(hhmm).trim();
  if (s === "24:00") return 24 * 60;
  const parts = s.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] || 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minutesToTime(mins) {
  if (!Number.isFinite(mins)) return null;
  if (mins >= 24 * 60) return "24:00";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Acepta "09:15", 9 (hora legacy), "20.30" / "20,30" o minutos. */
function scheduleValueToMinutes(raw) {
  if (raw == null || raw === "") return null;
  let s = String(raw).trim().replace(/\s+/g, "").replace(",", ".");
  if (!s || s.includes("-")) return null;

  if (/^\d{1,2}:\d{1,2}$/.test(s)) {
    const [hs, ms] = s.split(":");
    const h = Number(hs);
    const m = Number(ms);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 24 || m < 0 || m > 59) return null;
    if (h === 24 && m !== 0) return null;
    return h * 60 + m;
  }

  // 20.30 → 20:30 (no interpretar como horas decimales)
  const dec = /^(\d{1,2})\.(\d{1,2})$/.exec(s);
  if (dec) {
    const h = Number(dec[1]);
    let m = Number(dec[2]);
    if (dec[2].length === 1) m *= 10;
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 24 || m < 0 || m > 59) return null;
    if (h === 24 && m !== 0) return null;
    return h * 60 + m;
  }

  if (/^\d{1,2}$/.test(s)) {
    const h = Number(s);
    if (!Number.isFinite(h) || h < 0 || h > 24) return null;
    return h * 60;
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (Number.isInteger(n) && n >= 0 && n <= 24) return n * 60;
  if (n > 24 && n <= 24 * 60) return Math.round(n);
  return null;
}

function scheduleMinutesToClock(mins) {
  return minutesToTime(mins);
}

function rangesOverlap(start, end, otherStart, otherEnd) {
  return start < otherEnd && otherStart < end;
}

function toAppointmentTimestamp(fecha, horaInicio) {
  if (!fecha || !horaInicio) return NaN;
  const [year, month, day] = String(fecha).split("-").map(Number);
  const [hour = 0, minute = 0] = String(horaInicio).split(":").map(Number);
  if ([year, month, day, hour, minute].some((v) => !Number.isFinite(v))) return NaN;
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function isAppointmentExpired(appt, nowMs = Date.now()) {
  const ms = toAppointmentTimestamp(appt.fecha, appt.horaInicio);
  return !Number.isNaN(ms) && ms < nowMs;
}

function getBusinessOpenRanges(business) {
  const ranges = [];
  const a1 = scheduleValueToMinutes(business.horaInicio);
  const b1 = scheduleValueToMinutes(business.horaFin);
  if (Number.isFinite(a1) && Number.isFinite(b1) && a1 < b1) {
    ranges.push({ start: a1, end: b1 });
  }
  const a2 = scheduleValueToMinutes(business.horaInicio2);
  const b2 = scheduleValueToMinutes(business.horaFin2);
  if (Number.isFinite(a2) && Number.isFinite(b2) && a2 < b2) {
    ranges.push({ start: a2, end: b2 });
  }
  return ranges.sort((x, y) => x.start - y.start);
}

/** True si [startMin, endMin) entra completo en alguna franja abierta (horario efectivo). */
function fitsBusinessOpenRange(startMin, endMin, business, professionalId = null) {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return false;
  const schedule = effectiveSchedule(business, findProfessional(business, professionalId));
  return getBusinessOpenRanges(schedule).some((r) => startMin >= r.start && endMin <= r.end);
}

function getBusinessDaySpan(business) {
  const ranges = getBusinessOpenRanges(business);
  if (!ranges.length) return { desde: 0, hasta: 24 * 60 };
  return {
    desde: Math.min(...ranges.map((r) => r.start)),
    hasta: Math.max(...ranges.map((r) => r.end)),
  };
}

function getBloqueoRangeMinutes(bloqueo, business) {
  const span = getBusinessDaySpan(business);
  if (bloqueo.diaCompleto) return { desde: span.desde, hasta: span.hasta };
  if (bloqueo.horarioDesde && bloqueo.horarioHasta) {
    return {
      desde: timeToMinutes(bloqueo.horarioDesde),
      hasta: timeToMinutes(bloqueo.horarioHasta),
    };
  }
  const h = timeToMinutes(bloqueo.horario);
  if (h == null) return { desde: null, hasta: null };
  return { desde: h, hasta: h + 60 };
}

function bloqueoAppliesToProfessional(bloqueo, professionalId) {
  if (bloqueo.professionalId == null) return true;
  if (professionalId == null) return true;
  return Number(bloqueo.professionalId) === Number(professionalId);
}

function appointmentConflictsForProfessional(appt, professionalId) {
  if (appt.estado === "cancelada") return false;
  // Agenda del local (sin profesional) o turno sin profesional: ocupa el horario compartido
  if (professionalId == null || appt.professionalId == null) return true;
  return Number(appt.professionalId) === Number(professionalId);
}

function parseDiasAtencion(raw) {
  const fallback = [1, 2, 3, 4, 5]; // Lun–Vie
  if (raw == null || raw === "") return fallback;
  let parts;
  if (Array.isArray(raw)) {
    parts = raw.map(Number);
  } else {
    parts = String(raw).split(/[,\s]+/).map(Number);
  }
  const days = [...new Set(parts.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  return days.length ? days : fallback;
}

function serializeDiasAtencion(days) {
  return parseDiasAtencion(days).join(",");
}

function isBusinessOpenOnDate(business, fechaIso, professionalId = null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaIso || ""))) return false;
  const [y, m, d] = String(fechaIso).split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=Dom … 6=Sáb
  const schedule = effectiveSchedule(business, findProfessional(business, professionalId));
  const days = Array.isArray(schedule.diasAtencion)
    ? schedule.diasAtencion
    : parseDiasAtencion(schedule.diasAtencion);
  return days.includes(dow);
}

// Si el servicio tiene días propios (dias_atencion), solo se puede reservar
// esos días, sin importar que el local o el profesional atiendan ese día.
// Sin días propios = "igual al local", no agrega ninguna restricción.
function isServiceAvailableOnDate(service, fechaIso) {
  if (!service?.dias_atencion) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaIso || ""))) return false;
  const [y, m, d] = String(fechaIso).split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return parseDiasAtencion(service.dias_atencion).includes(dow);
}

/**
 * Genera slots HH:MM cada SLOT_STEP_MIN donde cabe un servicio de duracionMin.
 * Soporta una o dos franjas horarias (ej. 9-13 y 16-20).
 */
function generateAvailableSlots(duracionMin, appointments, bloqueos, professionalId, business, options = {}) {
  const duration = Number(duracionMin);
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const pro = findProfessional(business, professionalId);
  const schedule = effectiveSchedule(business, pro);
  const ranges = getBusinessOpenRanges(schedule);
  if (!ranges.length) return [];
  const excludeId = options.excludeAppointmentId != null ? Number(options.excludeAppointmentId) : null;

  const slots = [];
  for (const range of ranges) {
    for (let start = range.start; start + duration <= range.end; start += SLOT_STEP_MIN) {
      const end = start + duration;

      const conflictAppt = (appointments || []).some((a) => {
        if (excludeId != null && Number(a.id) === excludeId) return false;
        if (!appointmentConflictsForProfessional(a, professionalId)) return false;
        const aStart = timeToMinutes(a.horaInicio);
        const aEnd = timeToMinutes(a.horaFin);
        if (aStart == null || aEnd == null) return false;
        return rangesOverlap(start, end, aStart, aEnd);
      });
      if (conflictAppt) continue;

      const conflictBloqueo = (bloqueos || []).some((b) => {
        if (!bloqueoAppliesToProfessional(b, professionalId)) return false;
        const br = getBloqueoRangeMinutes(b, schedule);
        if (br.desde == null || br.hasta == null) return false;
        return rangesOverlap(start, end, br.desde, br.hasta);
      });
      if (conflictBloqueo) continue;

      slots.push(minutesToTime(start));
    }
  }
  return slots;
}

function bloqueosSeSuperponen(a, b, business) {
  if (a.diaCompleto || b.diaCompleto) return true;
  const ra = getBloqueoRangeMinutes(a, business);
  const rb = getBloqueoRangeMinutes(b, business);
  if (ra.desde == null || ra.hasta == null || rb.desde == null || rb.hasta == null) return false;
  return rangesOverlap(ra.desde, ra.hasta, rb.desde, rb.hasta);
}

/** True si el turno choca con el alcance (pro + horario) del bloqueo propuesto. */
function appointmentOverlapsBloqueo(appt, bloqueo, business) {
  if (!appt || appt.estado === "cancelada") return false;

  // Bloqueo de un profesional: no choca con turnos de otro profesional
  if (bloqueo.professionalId != null) {
    if (appt.professionalId != null && Number(appt.professionalId) !== Number(bloqueo.professionalId)) {
      return false;
    }
  }

  if (bloqueo.diaCompleto) return true;

  const br = getBloqueoRangeMinutes(bloqueo, business);
  const aStart = timeToMinutes(appt.horaInicio);
  const aEnd = timeToMinutes(appt.horaFin);
  if (br.desde == null || br.hasta == null || aStart == null || aEnd == null) return false;
  return rangesOverlap(aStart, aEnd, br.desde, br.hasta);
}

function describeTurnoConflictos(appointments) {
  const list = (appointments || []).slice(0, 3).map((a) => {
    const hora = a.horaInicio || "?";
    const nombre = a.nombre || "Cliente";
    return `${nombre} ${hora}hs`;
  });
  const extra = appointments.length > 3 ? ` y ${appointments.length - 3} más` : "";
  return list.length ? ` (${list.join(", ")}${extra})` : "";
}

function conflictErrorBloqueoVsTurnos(appointments) {
  const detalle = describeTurnoConflictos(appointments);
  const n = appointments.length;
  return `Hay ${n} turno${n === 1 ? "" : "s"} agendado${n === 1 ? "" : "s"}${detalle}. Cancelalo${n === 1 ? "" : "s"} antes de crear el bloqueo.`;
}

// ============================================================
// MAPPERS
// ============================================================
function mapBusinessRow(row, professionals = [], services = [], clientPlans = []) {
  const plan = row.plan || "canito";
  const pros = (professionals || []).map((p) => mapProfessionalRow(p));
  return {
    id: row.id,
    slug: row.slug,
    nombre: row.nombre,
    categoria: row.categoria || "estetica",
    ciudad: row.ciudad || null,
    barrio: row.barrio || null,
    direccion: row.direccion || null,
    colorMarca: row.color_marca || "#5b5f51",
    logoUrl: row.logo_url || null,
    aboutImageUrl: row.about_image_url || null,
    whatsapp: row.whatsapp || "",
    transferencia: {
      alias: row.transfer_alias || "",
      cbu: row.transfer_cbu || "",
      titular: row.transfer_titular || "",
    },
    horaInicio: scheduleMinutesToClock(scheduleValueToMinutes(row.hora_inicio)) || "09:00",
    horaFin: scheduleMinutesToClock(scheduleValueToMinutes(row.hora_fin)) || "20:00",
    horaInicio2: (() => {
      const m = scheduleValueToMinutes(row.hora_inicio_2);
      return Number.isFinite(m) ? scheduleMinutesToClock(m) : null;
    })(),
    horaFin2: (() => {
      const m = scheduleValueToMinutes(row.hora_fin_2);
      return Number.isFinite(m) ? scheduleMinutesToClock(m) : null;
    })(),
    diasAtencion: parseDiasAtencion(row.dias_atencion),
    precio: row.precio || "0",
    plan,
    estado: row.estado || "activo",
    estadoMotivo: row.estado_motivo || null,
    professionals: pros,
    services: (services || []).map(mapServiceRow),
    plans: (clientPlans || []).map(mapClientPlanRow),
    requiereProfesional: pros.filter((p) => p.activo).length > 1,
  };
}

function mapServiceRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    nombre: row.nombre,
    descripcion: row.descripcion || "",
    duracionMin: Number(row.duracion_min),
    precio: row.precio,
    sena: row.sena != null && row.sena !== "" ? row.sena : "0",
    categoria: row.categoria || null,
    activo: Boolean(row.activo),
    professionalId: row.professional_id ?? null,
    diasAtencion: row.dias_atencion ? parseDiasAtencion(row.dias_atencion) : null,
  };
}

function mapMovimientoRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    tipo: row.tipo === "gasto" ? "gasto" : "ingreso",
    descripcion: row.descripcion || "",
    categoria: row.categoria || "Otros",
    monto: Number(row.monto) || 0,
    fecha: row.fecha,
    appointmentId: row.appointment_id ?? null,
    creadoEn: row.creado_en,
  };
}

function parseMoneyAmount(raw) {
  const n = Number(String(raw ?? "0").replace(/[^\d.-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function appointmentPaymentAmount(service, business) {
  const sena = parseMoneyAmount(service?.sena);
  if (sena > 0) return sena;
  const precio = parseMoneyAmount(service?.precio);
  if (precio > 0) return precio;
  return parseMoneyAmount(business?.precio);
}

function turnoTag(appointmentId) {
  return `#turno:${appointmentId}`;
}

function descripcionTieneTurno(descripcion, appointmentId) {
  return String(descripcion || "").includes(turnoTag(appointmentId));
}

async function listMovimientosRaw(businessId) {
  if (USE_SQLITE) {
    return dbAll("SELECT * FROM movimientos WHERE business_id = ? ORDER BY fecha DESC, id DESC", [businessId]);
  }
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from("movimientos").select("*")
      .eq("business_id", businessId)
      .order("fecha", { ascending: false })
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
  return [];
}

async function findMovimientoForAppointment(businessId, appointmentId, allMovs = null) {
  if (!appointmentId) return null;
  const rows = allMovs || await listMovimientosRaw(businessId);
  const hit = rows.find((r) =>
    Number(r.appointment_id) === Number(appointmentId) ||
    descripcionTieneTurno(r.descripcion, appointmentId)
  );
  return hit || null;
}

async function createIngresoTurnoMovimiento({
  businessId,
  appointmentId,
  nombre,
  serviceNombre,
  fecha,
  horaInicio,
  monto,
  creadoEn,
  existingMovs = null,
}) {
  const amount = Number(monto) || 0;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!appointmentId) return null;

  const existing = await findMovimientoForAppointment(businessId, appointmentId, existingMovs);
  if (existing) return mapMovimientoRow(existing);

  const tag = turnoTag(appointmentId);
  const descripcion = `Turno · ${serviceNombre || "Servicio"} · ${nombre || "Cliente"} · ${horaInicio || ""}hs ${tag}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const now = creadoEn || new Date().toISOString();
  const base = {
    business_id: businessId,
    tipo: "ingreso",
    descripcion,
    categoria: "Turnos",
    monto: amount,
    fecha,
    creado_en: now,
  };

  if (USE_SUPABASE) {
    // Intento 1: con appointment_id (si la columna existe)
    let { data, error } = await supabase.from("movimientos").insert({
      ...base,
      appointment_id: appointmentId,
    }).select().single();

    if (error) {
      console.warn("[movimientos] intento 1 (con appointment_id) falló:", JSON.stringify({
        message: error.message, code: error.code, details: error.details, hint: error.hint, businessId, appointmentId, monto: amount,
      }));
      // Intento 2: sin appointment_id (migración pendiente)
      const retry = await supabase.from("movimientos").insert(base).select().single();
      if (retry.error) {
        const rErr = retry.error;
        console.warn("[movimientos] intento 2 (sin appointment_id) también falló:", JSON.stringify({
          message: rErr.message, code: rErr.code, details: rErr.details, hint: rErr.hint, businessId, appointmentId, monto: amount,
        }));
        const err = new Error(rErr.message || error.message);
        err.code = "MOVIMIENTO_INSERT";
        throw err;
      }
      data = retry.data;
    }
    return mapMovimientoRow(data);
  }

  try {
    const result = await dbRun(
      `INSERT INTO movimientos (business_id, tipo, descripcion, categoria, monto, fecha, appointment_id, creado_en)
       VALUES (?, 'ingreso', ?, 'Turnos', ?, ?, ?, ?)`,
      [businessId, descripcion, amount, fecha, appointmentId, now]
    );
    return {
      id: result.lastID,
      businessId,
      tipo: "ingreso",
      descripcion,
      categoria: "Turnos",
      monto: amount,
      fecha,
      appointmentId,
      creadoEn: now,
    };
  } catch (err) {
    try {
      const result = await dbRun(
        `INSERT INTO movimientos (business_id, tipo, descripcion, categoria, monto, fecha, creado_en)
         VALUES (?, 'ingreso', ?, 'Turnos', ?, ?, ?)`,
        [businessId, descripcion, amount, fecha, now]
      );
      return {
        id: result.lastID,
        businessId,
        tipo: "ingreso",
        descripcion,
        categoria: "Turnos",
        monto: amount,
        fecha,
        appointmentId: null,
        creadoEn: now,
      };
    } catch (err2) {
      const e = new Error(err2.message || err.message);
      e.code = "MOVIMIENTO_INSERT";
      throw e;
    }
  }
}

async function syncTurnoMovimientosForBusiness(business) {
  const result = { created: 0, error: null };
  try {
    const appointments = await readAppointments({
      businessId: business.id,
      includeCanceladas: false,
    });
    if (!appointments.length) return result;

    let existingMovs = [];
    try {
      existingMovs = await listMovimientosRaw(business.id);
    } catch (err) {
      result.error = err.message || String(err);
      console.warn("[movimientos] no se pudieron leer movimientos:", result.error);
      return result;
    }

    for (const appt of appointments) {
      if (await findMovimientoForAppointment(business.id, appt.id, existingMovs)) continue;

      let service = null;
      if (appt.serviceId) {
        try {
          service = await getServiceById(business.id, appt.serviceId);
        } catch (_) { service = null; }
      }

      if (!service && Array.isArray(business.services)) {
        service = business.services.find((s) => Number(s.id) === Number(appt.serviceId)) || null;
      }

      const mappedService = service && service.duracionMin != null
        ? service
        : service
          ? mapServiceRow(service)
          : null;

      const monto = appointmentPaymentAmount(mappedService || service, business);
      if (monto <= 0) continue;

      try {
        const mov = await createIngresoTurnoMovimiento({
          businessId: business.id,
          appointmentId: appt.id,
          nombre: appt.nombre,
          serviceNombre: (mappedService || service)?.nombre || "Servicio",
          fecha: appt.fecha,
          horaInicio: appt.horaInicio,
          monto,
          creadoEn: appt.creadoEn || new Date().toISOString(),
          existingMovs,
        });
        if (mov) {
          result.created += 1;
          existingMovs.push({
            id: mov.id,
            business_id: business.id,
            appointment_id: mov.appointmentId,
            descripcion: mov.descripcion,
          });
        }
      } catch (err) {
        result.error = err.message || String(err);
        console.warn("[movimientos] sync insert falló:", result.error);
        break;
      }
    }
    return result;
  } catch (err) {
    result.error = err.message || String(err);
    console.warn("[movimientos] sync falló:", result.error);
    return result;
  }
}

function mapClientPlanRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    nombre: row.nombre,
    sesiones: Number(row.sesiones),
    precio: row.precio,
    descripcion: row.descripcion || "",
    activo: Boolean(row.activo),
  };
}

function mapProfessionalRow(row) {
  const horaInicioMin = scheduleValueToMinutes(row.hora_inicio);
  const horaFinMin = scheduleValueToMinutes(row.hora_fin);
  const horarioPropio = Number.isFinite(horaInicioMin) && Number.isFinite(horaFinMin) && horaInicioMin < horaFinMin;
  return {
    id: row.id,
    businessId: row.business_id,
    nombre: row.nombre,
    especialidad: row.especialidad || null,
    matricula: row.matricula || null,
    bio: row.bio || null,
    fotoUrl: row.foto_url || null,
    activo: Boolean(row.activo),
    horarioPropio,
    horaInicio: horarioPropio ? scheduleMinutesToClock(horaInicioMin) : null,
    horaFin: horarioPropio ? scheduleMinutesToClock(horaFinMin) : null,
    horaInicio2: (() => {
      const m = scheduleValueToMinutes(row.hora_inicio_2);
      return Number.isFinite(m) ? scheduleMinutesToClock(m) : null;
    })(),
    horaFin2: (() => {
      const m = scheduleValueToMinutes(row.hora_fin_2);
      return Number.isFinite(m) ? scheduleMinutesToClock(m) : null;
    })(),
    diasAtencion:
      row.dias_atencion != null && String(row.dias_atencion).trim() !== ""
        ? parseDiasAtencion(row.dias_atencion)
        : null,
    serviceIds: Array.isArray(row.serviceIds)
      ? row.serviceIds.map(Number).filter(Number.isFinite)
      : [],
  };
}

async function listProfessionalServiceLinks(businessId) {
  if (USE_SQLITE) {
    return dbAll(
      "SELECT professional_id, service_id FROM professional_services WHERE business_id = ?",
      [businessId]
    );
  }
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from("professional_services")
      .select("professional_id, service_id")
      .eq("business_id", businessId);
    if (error) {
      if (/professional_services|does not exist|relation|schema cache/i.test(error.message || "")) {
        // Fallback legacy: services.professional_id
        const { data: services } = await supabase
          .from("services")
          .select("id, professional_id")
          .eq("business_id", businessId)
          .not("professional_id", "is", null);
        return (services || []).map((s) => ({
          professional_id: s.professional_id,
          service_id: s.id,
        }));
      }
      throw new Error(error.message);
    }
    return data || [];
  }
  return [];
}

async function attachServiceIdsToProfessionals(businessId, professionals) {
  const links = await listProfessionalServiceLinks(businessId);
  const byPro = new Map();
  for (const link of links) {
    const pid = Number(link.professional_id);
    const sid = Number(link.service_id);
    if (!byPro.has(pid)) byPro.set(pid, []);
    byPro.get(pid).push(sid);
  }
  return (professionals || []).map((p) => {
    const mapped = mapProfessionalRow(p);
    mapped.serviceIds = byPro.get(Number(mapped.id)) || [];
    return mapped;
  });
}

function parseServiceIds(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
}

function rlsHintProfessionalServices(message) {
  if (/row-level security|rls/i.test(message || "")) {
    return (
      "Supabase bloquea professional_services (RLS). En SQL Editor ejecutá: " +
      "alter table professional_services disable row level security;"
    );
  }
  return message;
}

async function syncProfessionalServices(businessId, professionalId, serviceIds) {
  const ids = parseServiceIds(serviceIds);

  if (USE_SQLITE) {
    const valid = ids.length
      ? await dbAll(
          `SELECT id FROM services WHERE business_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
          [businessId, ...ids]
        )
      : [];
    const validIds = valid.map((r) => Number(r.id));
    await dbRun(
      "DELETE FROM professional_services WHERE business_id = ? AND professional_id = ?",
      [businessId, professionalId]
    );
    for (const sid of validIds) {
      await dbRun(
        `INSERT OR IGNORE INTO professional_services (professional_id, service_id, business_id)
         VALUES (?, ?, ?)`,
        [professionalId, sid, businessId]
      );
      await dbRun(
        "UPDATE services SET professional_id = ? WHERE id = ? AND business_id = ?",
        [professionalId, sid, businessId]
      );
    }
    if (validIds.length) {
      await dbRun(
        `UPDATE services SET professional_id = NULL
         WHERE business_id = ? AND professional_id = ?
           AND id NOT IN (${validIds.map(() => "?").join(",")})`,
        [businessId, professionalId, ...validIds]
      );
    } else {
      await dbRun(
        "UPDATE services SET professional_id = NULL WHERE business_id = ? AND professional_id = ?",
        [businessId, professionalId]
      );
    }
    return validIds;
  }

  if (USE_SUPABASE) {
    let validIds = [];
    if (ids.length) {
      const { data: valid, error: vErr } = await supabase
        .from("services")
        .select("id")
        .eq("business_id", businessId)
        .in("id", ids);
      if (vErr) throw new Error(vErr.message);
      validIds = (valid || []).map((r) => Number(r.id));
    }

    const { error: delErr } = await supabase
      .from("professional_services")
      .delete()
      .eq("business_id", businessId)
      .eq("professional_id", professionalId);
    if (delErr && !/professional_services|does not exist|relation|schema cache/i.test(delErr.message || "")) {
      throw new Error(rlsHintProfessionalServices(delErr.message));
    }

    if (validIds.length && !delErr) {
      const rows = validIds.map((sid) => ({
        professional_id: professionalId,
        service_id: sid,
        business_id: businessId,
      }));
      const { error: insErr } = await supabase.from("professional_services").insert(rows);
      if (insErr) throw new Error(rlsHintProfessionalServices(insErr.message));
    }

    // Legacy FK update best-effort
    await supabase
      .from("services")
      .update({ professional_id: null })
      .eq("business_id", businessId)
      .eq("professional_id", professionalId);
    for (const sid of validIds) {
      await supabase
        .from("services")
        .update({ professional_id: professionalId })
        .eq("id", sid)
        .eq("business_id", businessId);
    }
    return validIds;
  }
  return ids;
}

/** Vincula un servicio a un profesional sin tocar el resto de sus servicios. */
async function ensureProfessionalServiceLink(businessId, serviceId, professionalId) {
  if (!Number.isFinite(Number(serviceId)) || !Number.isFinite(Number(professionalId))) return;
  const sid = Number(serviceId);
  const pid = Number(professionalId);

  if (USE_SQLITE) {
    const pro = await dbGet(
      "SELECT id FROM professionals WHERE id = ? AND business_id = ? LIMIT 1",
      [pid, businessId]
    );
    if (!pro) return;
    await dbRun(
      `INSERT OR IGNORE INTO professional_services (professional_id, service_id, business_id)
       VALUES (?, ?, ?)`,
      [pid, sid, businessId]
    );
    return;
  }

  if (USE_SUPABASE) {
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("id", pid)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!pro) return;
    const { error } = await supabase.from("professional_services").upsert(
      { professional_id: pid, service_id: sid, business_id: businessId },
      { onConflict: "professional_id,service_id", ignoreDuplicates: true }
    );
    if (error && !/professional_services|does not exist|relation|schema cache|duplicate/i.test(error.message || "")) {
      throw new Error(rlsHintProfessionalServices(error.message));
    }
  }
}

function mapAppointmentRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    serviceId: row.service_id ?? null,
    professionalId: row.professional_id ?? null,
    nombre: row.nombre,
    telefono: row.telefono,
    fecha: row.fecha,
    horaInicio: row.hora_inicio,
    horaFin: row.hora_fin,
    duracionMin: Number(row.duracion_min),
    estado: row.estado || "pendiente",
    cancelToken: row.cancel_token,
    comprobante: {
      nombreOriginal: row.comprobante_nombre_original,
      archivo: row.comprobante_archivo,
      mimetype: row.comprobante_mimetype,
      size: row.comprobante_size,
    },
    creadoEn: row.creado_en,
  };
}

function mapBloqueoRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    professionalId: row.professional_id ?? null,
    fecha: row.fecha,
    horario: row.horario,
    horarioDesde: row.horario_desde,
    horarioHasta: row.horario_hasta,
    diaCompleto: Boolean(row.dia_completo),
    motivo: row.motivo,
    creadoEn: row.creado_en,
  };
}

function mapBloqueoRecurrenteRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    professionalId: row.professional_id ?? null,
    diaSemana: row.dia_semana,
    horarioDesde: row.horario_desde,
    horarioHasta: row.horario_hasta,
    diaCompleto: Boolean(row.dia_completo),
    motivo: row.motivo,
    activo: Boolean(row.activo),
    creadoEn: row.creado_en,
  };
}

// ============================================================
// BUSINESS DATA ACCESS
// ============================================================
async function getBusinessBySlug(slug, { onlyActivo = true } = {}) {
  if (USE_SQLITE) {
    const row = onlyActivo
      ? await dbGet("SELECT * FROM businesses WHERE slug = ? AND estado = 'activo' LIMIT 1", [slug])
      : await dbGet("SELECT * FROM businesses WHERE slug = ? LIMIT 1", [slug]);
    if (!row) return null;
    const professionals = await dbAll(
      "SELECT * FROM professionals WHERE business_id = ? AND activo = 1 ORDER BY id ASC",
      [row.id]
    );
    const services = await dbAll(
      "SELECT * FROM services WHERE business_id = ? AND activo = 1 ORDER BY id ASC",
      [row.id]
    );
    const clientPlans = await dbAll(
      "SELECT * FROM plans WHERE business_id = ? AND activo = 1 ORDER BY id ASC",
      [row.id]
    );
    const mapped = mapBusinessRow(row, professionals, services, clientPlans);
    const withLinks = await attachServiceIdsToProfessionals(row.id, professionals);
    const byId = new Map(withLinks.map((p) => [Number(p.id), p.serviceIds || []]));
    mapped.professionals = mapped.professionals.map((p) => ({
      ...p,
      serviceIds: byId.get(Number(p.id)) || [],
    }));
    mapped.services = mapped.services.map((s) => ({
      ...s,
      professionalIds: withLinks
        .filter((p) => (p.serviceIds || []).includes(Number(s.id)))
        .map((p) => Number(p.id)),
    }));
    mapped.maxProfessionals = await getMaxProfessionals(mapped.plan);
    return mapped;
  }
  if (USE_SUPABASE) {
    let query = supabase.from("businesses").select("*").eq("slug", slug);
    if (onlyActivo) query = query.eq("estado", "activo");
    const { data: row, error } = await query.maybeSingle();
    if (error || !row) return null;
    const [{ data: professionals }, { data: services }, { data: clientPlans }] = await Promise.all([
      supabase.from("professionals").select("*").eq("business_id", row.id).eq("activo", true).order("id"),
      supabase.from("services").select("*").eq("business_id", row.id).eq("activo", true).order("id"),
      supabase.from("plans").select("*").eq("business_id", row.id).eq("activo", true).order("id"),
    ]);
    const mapped = mapBusinessRow(row, professionals || [], services || [], clientPlans || []);
    const withLinks = await attachServiceIdsToProfessionals(row.id, professionals || []);
    const byId = new Map(withLinks.map((p) => [Number(p.id), p.serviceIds || []]));
    mapped.professionals = mapped.professionals.map((p) => ({
      ...p,
      serviceIds: byId.get(Number(p.id)) || [],
    }));
    mapped.services = mapped.services.map((s) => ({
      ...s,
      professionalIds: withLinks
        .filter((p) => (p.serviceIds || []).includes(Number(s.id)))
        .map((p) => Number(p.id)),
    }));
    mapped.maxProfessionals = await getMaxProfessionals(mapped.plan);
    return mapped;
  }
  return null;
}

// ============================================================
// SEED
// ============================================================
async function ensureAdminForBusiness(businessId, now) {
  if (USE_SQLITE) {
    const existing = await dbGet("SELECT id FROM business_admins WHERE business_id = ? LIMIT 1", [businessId]);
    if (existing) return;
    await setBusinessAdminPassword(businessId, DEFAULT_ADMIN_PASSWORD);
    return;
  }
  if (USE_SUPABASE) {
    const { data: existing } = await supabase
      .from("business_admins").select("id").eq("business_id", businessId).maybeSingle();
    if (existing) return;
    try {
      await setBusinessAdminPassword(businessId, DEFAULT_ADMIN_PASSWORD);
    } catch (error) {
      console.warn("[seed] No se pudo crear business_admin:", error.message);
    }
  }
}

// Canito Skin: un solo negocio. En Supabase el seed real vive en
// supabase-canitoskin.sql; acá solo garantizamos el fallback local (SQLite).
async function seedDefaultBusiness() {
  const now = new Date().toISOString();

  if (USE_SUPABASE) return;
  if (!USE_SQLITE) return;

  const existing = await dbGet("SELECT id FROM businesses WHERE slug = ? LIMIT 1", [DEFAULT_BUSINESS_SLUG]);
  if (existing) {
    await ensureAdminForBusiness(existing.id, now);
    return;
  }
  const result = await dbRun(
    `INSERT INTO businesses (
       slug, nombre, categoria, ciudad, barrio, direccion, color_marca, whatsapp,
       transfer_alias, transfer_cbu, transfer_titular,
       hora_inicio, hora_fin, precio, plan, estado, creado_en
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'canito', 'activo', ?)`,
    [
      DEFAULT_BUSINESS_SLUG, DEFAULT_BUSINESS_NOMBRE, DEFAULT_BUSINESS_CATEGORIA,
      DEFAULT_BUSINESS_CIUDAD, DEFAULT_BUSINESS_BARRIO, DEFAULT_BUSINESS_DIRECCION, DEFAULT_BUSINESS_COLOR,
      DEFAULT_BUSINESS_WHATSAPP, DEFAULT_BUSINESS_ALIAS, DEFAULT_BUSINESS_CBU,
      DEFAULT_BUSINESS_TITULAR, DEFAULT_BUSINESS_HORA_INICIO, DEFAULT_BUSINESS_HORA_FIN,
      DEFAULT_BUSINESS_PRECIO, now,
    ]
  );
  const businessId = result.lastID;

  await dbRun(
    "INSERT INTO professionals (business_id, nombre, especialidad, activo) VALUES (?, ?, ?, 1)",
    [businessId, "Cande", "Estética facial / skincare"]
  );

  const seedServices = [
    { nombre: "Limpieza facial profunda", descripcion: "Limpieza y renovación de la piel", duracion_min: 60, precio: "15000", sena: "5000", categoria: "Faciales" },
    { nombre: "Extracciones", descripcion: "Extracciones controladas según tipo de piel", duracion_min: 45, precio: "12000", sena: "4000", categoria: "Faciales" },
    { nombre: "Tratamiento pieles maduras", descripcion: "Protocolo de cuidado para pieles maduras", duracion_min: 75, precio: "18000", sena: "6000", categoria: "Faciales" },
  ];
  for (const s of seedServices) {
    await dbRun(
      `INSERT INTO services (business_id, nombre, descripcion, duracion_min, precio, sena, categoria, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [businessId, s.nombre, s.descripcion, s.duracion_min, s.precio, s.sena, s.categoria]
    );
  }

  await ensureAdminForBusiness(businessId, now);
  console.log(`[seed] Negocio "${DEFAULT_BUSINESS_NOMBRE}" creado con slug "${DEFAULT_BUSINESS_SLUG}"`);
}

// ============================================================
// DATA READERS
// ============================================================
async function readAppointments({ businessId, fecha = "", professionalId = undefined, includeCanceladas = false } = {}) {
  if (USE_SUPABASE) {
    let query = supabase.from("appointments").select("*")
      .order("fecha", { ascending: true }).order("hora_inicio", { ascending: true });
    if (businessId != null) query = query.eq("business_id", businessId);
    if (fecha) query = query.eq("fecha", fecha);
    if (professionalId !== undefined && professionalId !== null) {
      query = query.eq("professional_id", professionalId);
    }
    if (!includeCanceladas) query = query.neq("estado", "cancelada");
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data.map(mapAppointmentRow);
  }
  const where = [];
  const params = [];
  if (businessId != null) { where.push("business_id = ?"); params.push(businessId); }
  if (fecha) { where.push("fecha = ?"); params.push(fecha); }
  if (professionalId !== undefined && professionalId !== null) {
    where.push("professional_id = ?");
    params.push(professionalId);
  }
  if (!includeCanceladas) where.push("estado != 'cancelada'");
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await dbAll(
    `SELECT * FROM appointments ${whereSql} ORDER BY fecha ASC, hora_inicio ASC, id DESC`,
    params
  );
  return rows.map(mapAppointmentRow);
}

async function purgeExpiredAppointments(businessId) {
  const nowMs = Date.now();
  const appointments = await readAppointments({ businessId, includeCanceladas: true });
  const expiradas = appointments.filter((a) => a.estado !== "cancelada" && isAppointmentExpired(a, nowMs));
  if (!expiradas.length) return 0;
  const ids = expiradas.map((a) => Number(a.id)).filter((id) => Number.isFinite(id));
  if (!ids.length) return 0;

  if (USE_SUPABASE) {
    const archivos = expiradas.map((a) => a.comprobante?.archivo).filter(Boolean);
    if (archivos.length) await supabase.storage.from(SUPABASE_BUCKET).remove(archivos);
    const { error } = await supabase.from("appointments").delete().in("id", ids);
    if (error) throw new Error(error.message);
    return ids.length;
  }
  const placeholders = ids.map(() => "?").join(", ");
  await dbRun(`DELETE FROM appointments WHERE id IN (${placeholders})`, ids);
  return ids.length;
}

async function readBloqueosRecurrentes({ businessId, professionalId = undefined } = {}) {
  if (USE_SUPABASE) {
    let query = supabase.from("bloqueos_recurrentes").select("*").eq("activo", true).order("dia_semana", { ascending: true });
    if (businessId != null) query = query.eq("business_id", businessId);
    if (professionalId !== undefined && professionalId !== null) {
      query = query.or(`professional_id.is.null,professional_id.eq.${professionalId}`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data.map(mapBloqueoRecurrenteRow);
  }
  const where = ["activo = 1"];
  const params = [];
  if (businessId != null) { where.push("business_id = ?"); params.push(businessId); }
  if (professionalId !== undefined && professionalId !== null) {
    where.push("(professional_id IS NULL OR professional_id = ?)");
    params.push(professionalId);
  }
  const rows = await dbAll(
    `SELECT * FROM bloqueos_recurrentes WHERE ${where.join(" AND ")} ORDER BY dia_semana ASC, id ASC`,
    params
  );
  return rows.map(mapBloqueoRecurrenteRow);
}

async function readBloqueos({ businessId, fecha = "", professionalId = undefined } = {}) {
  let bloqueos;
  if (USE_SUPABASE) {
    let query = supabase.from("bloqueos").select("*").order("fecha", { ascending: true });
    if (businessId != null) query = query.eq("business_id", businessId);
    if (fecha) query = query.eq("fecha", fecha);
    if (professionalId !== undefined && professionalId !== null) {
      query = query.or(`professional_id.is.null,professional_id.eq.${professionalId}`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    bloqueos = data.map(mapBloqueoRow);
  } else {
    const where = [];
    const params = [];
    if (businessId != null) { where.push("business_id = ?"); params.push(businessId); }
    if (fecha) { where.push("fecha = ?"); params.push(fecha); }
    if (professionalId !== undefined && professionalId !== null) {
      where.push("(professional_id IS NULL OR professional_id = ?)");
      params.push(professionalId);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await dbAll(
      `SELECT * FROM bloqueos ${whereSql} ORDER BY fecha ASC, id DESC`,
      params
    );
    bloqueos = rows.map(mapBloqueoRow);
  }

  if (fecha) {
    const [y, m, d] = fecha.split("-").map(Number);
    const diaSemana = new Date(y, m - 1, d).getDay();
    const recurrentes = await readBloqueosRecurrentes({ businessId, professionalId });
    const paraHoy = recurrentes
      .filter((r) => r.diaSemana === diaSemana)
      .map((r) => ({
        id: `rec-${r.id}`,
        businessId: r.businessId,
        professionalId: r.professionalId,
        fecha,
        horario: null,
        horarioDesde: r.horarioDesde,
        horarioHasta: r.horarioHasta,
        diaCompleto: r.diaCompleto,
        motivo: r.motivo || "Bloqueo recurrente",
        creadoEn: r.creadoEn,
      }));
    return [...bloqueos, ...paraHoy];
  }
  return bloqueos;
}

async function getServiceById(businessId, serviceId) {
  if (USE_SQLITE) {
    return dbGet("SELECT * FROM services WHERE id = ? AND business_id = ? LIMIT 1", [serviceId, businessId]);
  }
  if (USE_SUPABASE) {
    const { data } = await supabase.from("services").select("*")
      .eq("id", serviceId).eq("business_id", businessId).maybeSingle();
    return data;
  }
  return null;
}

function resolveProfessionalForBooking(business, requestedProfessionalId, serviceId = null) {
  let activePros = (business.professionals || []).filter((p) => p.activo !== false);
  const sid = serviceId != null && serviceId !== "" ? Number(serviceId) : null;

  if (Number.isFinite(sid)) {
    const linked = activePros.filter((p) => {
      const ids = Array.isArray(p.serviceIds) ? p.serviceIds.map(Number) : [];
      return ids.includes(sid);
    });
    const svc = (business.services || []).find((s) => Number(s.id) === sid);
    const fromSvc = Array.isArray(svc?.professionalIds)
      ? svc.professionalIds.map(Number).filter(Number.isFinite)
      : [];
    const hasExplicitAssignment =
      linked.length > 0 ||
      fromSvc.length > 0 ||
      (svc?.professionalId != null && svc.professionalId !== "");

    if (!hasExplicitAssignment) {
      // Sin profesional asignado al servicio → se agenda con el horario del local
      return { professionalId: null, error: null };
    }
    if (linked.length) {
      activePros = linked;
    } else if (fromSvc.length) {
      activePros = activePros.filter((p) => fromSvc.includes(Number(p.id)));
    } else {
      activePros = activePros.filter((p) => Number(p.id) === Number(svc.professionalId));
    }
  }

  if (activePros.length === 0) {
    // Sin profesionales activos / vínculo vacío → horario del local
    return { professionalId: null, error: null };
  }
  if (activePros.length === 1) {
    return { professionalId: activePros[0].id, error: null };
  }
  if (requestedProfessionalId == null || requestedProfessionalId === "") {
    return { professionalId: null, error: "Debés seleccionar un profesional." };
  }
  const pid = Number(requestedProfessionalId);
  if (!activePros.some((p) => Number(p.id) === pid)) {
    return { professionalId: null, error: "Ese profesional no atiende este servicio." };
  }
  return { professionalId: pid, error: null };
}

function buildWhatsAppUrl(whatsappNumero, text) {
  const num = String(whatsappNumero || "").replace(/\D/g, "");
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

function comprobantePublicUrl(req, archivo) {
  if (USE_SUPABASE) {
    return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(archivo).data.publicUrl;
  }
  return `${req.protocol}://${req.get("host")}/uploads/${archivo}`;
}

// ============================================================
// EXPRESS SETUP
// ============================================================
const storage = USE_SUPABASE
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^\w.\-]/g, "_").toLowerCase();
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) { cb(null, true); return; }
    cb(new Error("Solo se permiten imagenes (JPG, PNG, WEBP) o PDF."));
  },
});

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Solo se permiten imágenes."));
  },
});

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
});

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(ROOT_DIR, "public"), {
  index: false,
  etag: true,
  maxAge: IS_VERCEL ? "5m" : 0,
  setHeaders(res, filePath) {
    if (/\.(html)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-store");
    } else if (/\.(js|css)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
    }
  },
}));

const dbReady = initDb()
  .then(() => seedDefaultBusiness())
  .catch((err) => console.error("[init] Error inicializando BD:", err.message));

app.use(async (_req, _res, next) => {
  try { await dbReady; next(); } catch (error) { next(error); }
});

async function resolveBusiness(req, res, next) {
  try {
    const slug = req.params.slug;
    const business = await getBusinessBySlug(slug, { onlyActivo: true });
    if (!business) return res.status(404).json({ error: "Negocio no encontrado." });
    req.business = business;
    return next();
  } catch (error) { return next(error); }
}

// ============================================================
// PUBLIC LIST
// ============================================================
// ============================================================
// API /api/:slug/...
// ============================================================
app.get("/api/:slug/config", resolveBusiness, async (req, res, next) => {
  try {
    const b = req.business;
    const activePros = b.professionals.filter((p) => p.activo);
    res.json({
      slug: b.slug,
      nombre: b.nombre,
      categoria: b.categoria,
      ciudad: b.ciudad,
      barrio: b.barrio,
      direccion: b.direccion || null,
      colorMarca: b.colorMarca,
      logoUrl: b.logoUrl,
      aboutImageUrl: b.aboutImageUrl,
      horaInicio: b.horaInicio,
      horaFin: b.horaFin,
      horaInicio2: b.horaInicio2,
      horaFin2: b.horaFin2,
      diasAtencion: b.diasAtencion || [1, 2, 3, 4, 5],
      precio: b.precio,
      plan: b.plan,
      maxProfessionals: b.maxProfessionals,
      transferencia: b.transferencia,
      whatsappNumero: b.whatsapp,
      services: (b.services || []).map((s) => ({
        id: s.id,
        nombre: s.nombre,
        descripcion: s.descripcion,
        duracionMin: s.duracionMin,
        precio: s.precio,
        sena: s.sena,
        categoria: s.categoria,
        professionalId: s.professionalId ?? null,
        professionalIds: Array.isArray(s.professionalIds)
          ? s.professionalIds
          : (s.professionalId != null ? [Number(s.professionalId)] : []),
        diasAtencion: s.diasAtencion || null,
      })),
      plans: b.plans,
      requiereProfesional: activePros.length > 1,
      professionals: activePros.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        especialidad: p.especialidad || null,
        matricula: p.matricula || null,
        bio: p.bio || null,
        fotoUrl: p.fotoUrl || null,
        serviceIds: Array.isArray(p.serviceIds) ? p.serviceIds : [],
        horarioPropio: Boolean(p.horarioPropio),
        horaInicio: p.horaInicio ?? null,
        horaFin: p.horaFin ?? null,
        horaInicio2: p.horaInicio2 ?? null,
        horaFin2: p.horaFin2 ?? null,
        diasAtencion: Array.isArray(p.diasAtencion) ? p.diasAtencion : null,
      })),
      professionalsCount: activePros.length,
      slotStepMin: SLOT_STEP_MIN,
    });
  } catch (error) { next(error); }
});

// Preview de productos para la landing (destacado=true). Lectura pública
// mínima; el CRUD completo del market todavía no existe.
app.get("/api/:slug/productos-destacados", resolveBusiness, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.json([]);
    const { data, error } = await supabase
      .from("productos")
      .select("id, nombre, descripcion, precio_base, imagen_url, categoria")
      .eq("business_id", req.business.id)
      .eq("activo", true)
      .eq("destacado", true)
      .order("created_at", { ascending: false })
      .limit(4);
    if (error) throw new Error(error.message);
    res.json((data || []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio_base,
      imagenUrl: p.imagen_url,
      categoria: p.categoria,
    })));
  } catch (error) { next(error); }
});

// Catálogo público completo del market (no solo destacados).
app.get("/api/:slug/productos", resolveBusiness, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.json([]);
    const { data, error } = await supabase
      .from("productos")
      .select("id, nombre, descripcion, precio_base, imagen_url, categoria, destacado, stock, created_at")
      .eq("business_id", req.business.id)
      .eq("activo", true)
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingTableError(error)) return res.json([]);
      throw new Error(error.message);
    }
    res.json((data || []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio_base,
      imagenUrl: p.imagen_url,
      categoria: p.categoria,
      destacado: p.destacado === true,
      stock: p.stock ?? null,
      createdAt: p.created_at,
    })));
  } catch (error) { next(error); }
});

// Videos institucionales de la landing, gestionados desde el admin.
app.get("/api/:slug/videos", resolveBusiness, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.json([]);
    const { data, error } = await supabase
      .from("videos_landing")
      .select("id, titulo, url, seccion, orden")
      .eq("business_id", req.business.id)
      .eq("activo", true)
      .order("orden", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return res.json([]);
      throw new Error(error.message);
    }
    res.json((data || []).map(mapVideoRow));
  } catch (error) { next(error); }
});

// Galería "Pieles reales" de la landing, gestionada desde el admin.
app.get("/api/:slug/galeria", resolveBusiness, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.json([]);
    const { data, error } = await supabase
      .from("galeria_pieles")
      .select("id, titulo, imagen_url, orden")
      .eq("business_id", req.business.id)
      .eq("activo", true)
      .order("orden", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return res.json([]);
      throw new Error(error.message);
    }
    res.json((data || []).map(mapGaleriaRow));
  } catch (error) { next(error); }
});

// Crea un pedido del market ("solicitud de compra", confirmación manual).
// El precio SIEMPRE se recalcula desde productos.precio_base — nunca se
// confía en el precio que manda el cliente.
app.post("/api/:slug/pedidos", resolveBusiness, upload.single("comprobante"), async (req, res, next) => {
  try {
    if (!USE_SUPABASE) {
      return res.status(501).json({ error: "El carrito de compras todavía no está disponible en este entorno." });
    }

    const nombre = (req.body?.nombre || "").trim();
    const telefono = (req.body?.telefono || "").trim();
    const email = (req.body?.email || "").trim() || null;
    const entregaTipo = req.body?.entregaTipo === "envio" ? "envio" : "retiro";
    const entregaDireccion = entregaTipo === "envio" ? (req.body?.entregaDireccion || "").trim() : null;
    const notas = (req.body?.notas || "").trim().slice(0, 500) || null;
    const pagoMetodo = req.body?.pagoMetodo === "efectivo" ? "efectivo" : "transferencia";
    let items = [];
    try {
      items = JSON.parse(req.body?.items || "[]");
    } catch (_) {
      return res.status(400).json({ error: "Carrito inválido." });
    }
    if (!Array.isArray(items)) items = [];

    if (!nombre || nombre.length < 3) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (nombre.length > 100) return res.status(400).json({ error: "El nombre no puede superar 100 caracteres." });
    if (!telefono || telefono.length < 6) return res.status(400).json({ error: "El teléfono es obligatorio." });
    if (telefono.length > 30) return res.status(400).json({ error: "El teléfono es inválido." });
    if (entregaTipo === "envio" && !entregaDireccion) {
      return res.status(400).json({ error: "Ingresá la dirección de envío." });
    }
    if (pagoMetodo === "transferencia" && !req.file) {
      return res.status(400).json({ error: "Subí el comprobante de la transferencia o elegí pagar en efectivo." });
    }
    if (!items.length) return res.status(400).json({ error: "El carrito está vacío." });
    if (items.length > 50) return res.status(400).json({ error: "Carrito inválido." });

    let comprobanteUrl = null;
    if (req.file) {
      const validMagic = await validateFileMagicBytes(req.file);
      if (!validMagic) return res.status(400).json({ error: "El comprobante no es válido. Solo JPG, PNG, WEBP o PDF." });
      const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
      const storagePath = `pedidos/${req.business.id}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET).upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      comprobanteUrl = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    }

    const productoIds = [...new Set(items.map((it) => Number(it?.productoId)).filter(Number.isFinite))];
    if (!productoIds.length) return res.status(400).json({ error: "Carrito inválido." });

    const { data: productos, error: prodError } = await supabase
      .from("productos")
      .select("id, nombre, precio_base, activo")
      .eq("business_id", req.business.id)
      .in("id", productoIds);
    if (prodError) throw new Error(prodError.message);

    const productoById = new Map((productos || []).map((p) => [Number(p.id), p]));
    const pedidoItems = [];
    let total = 0;
    for (const it of items) {
      const producto = productoById.get(Number(it?.productoId));
      if (!producto || !producto.activo) {
        return res.status(400).json({ error: `El producto "${it?.nombre || ""}" ya no está disponible.` });
      }
      const cantidad = Math.max(1, Math.min(50, Math.trunc(Number(it?.cantidad) || 1)));
      const precioUnitario = Number(producto.precio_base) || 0;
      total += precioUnitario * cantidad;
      pedidoItems.push({
        producto_id: producto.id,
        nombre: producto.nombre,
        cantidad,
        precio_unitario: precioUnitario,
      });
    }

    const { data: pedido, error: pedidoError } = await supabase.from("pedidos").insert({
      business_id: req.business.id,
      nombre,
      telefono,
      email,
      entrega_tipo: entregaTipo,
      entrega_direccion: entregaDireccion,
      notas,
      total,
      pago_metodo: pagoMetodo,
      comprobante_url: comprobanteUrl,
    }).select().single();
    if (pedidoError) throw new Error(pedidoError.message);

    const { error: itemsError } = await supabase.from("pedido_items").insert(
      pedidoItems.map((it) => ({ ...it, pedido_id: pedido.id }))
    );
    if (itemsError) throw new Error(itemsError.message);

    res.json({ id: pedido.id, total, items: pedidoItems, pagoMetodo, comprobanteUrl });
  } catch (error) { next(error); }
});

app.get("/api/:slug/disponibilidad", resolveBusiness, async (req, res, next) => {
  try {
    const fecha = (req.query.fecha || "").trim();
    const serviceId = Number(req.query.serviceId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ error: "Fecha inválida." });
    }
    if (!Number.isFinite(serviceId)) {
      return res.status(400).json({ error: "serviceId inválido." });
    }

    const service = await getServiceById(req.business.id, serviceId);
    if (!service || !service.activo) {
      return res.status(404).json({ error: "Servicio no encontrado." });
    }

    const { professionalId, error: proError } = resolveProfessionalForBooking(
      req.business,
      req.query.professionalId,
      serviceId
    );
    if (proError) return res.status(400).json({ error: proError });

    if (!isBusinessOpenOnDate(req.business, fecha, professionalId) || !isServiceAvailableOnDate(service, fecha)) {
      return res.json({
        fecha,
        serviceId,
        professionalId,
        duracionMin: Number(service.duracion_min),
        slots: [],
        cerrado: true,
      });
    }

    const [appointments, bloqueos] = await Promise.all([
      readAppointments({ businessId: req.business.id, fecha }),
      readBloqueos({ businessId: req.business.id, fecha, professionalId: professionalId ?? undefined }),
    ]);

    const excludeAppointmentId = req.query.excludeAppointmentId
      ? Number(req.query.excludeAppointmentId)
      : null;

    const slots = generateAvailableSlots(
      service.duracion_min,
      appointments,
      bloqueos,
      professionalId,
      req.business,
      { excludeAppointmentId: Number.isFinite(excludeAppointmentId) ? excludeAppointmentId : null }
    );

    res.json({
      fecha,
      serviceId,
      professionalId,
      duracionMin: Number(service.duracion_min),
      slots,
    });
  } catch (error) { next(error); }
});

app.get("/api/:slug/bloqueos", resolveBusiness, async (req, res, next) => {
  try {
    const fecha = (req.query.fecha || "").trim();
    const professionalId = req.query.professionalId != null && req.query.professionalId !== ""
      ? Number(req.query.professionalId)
      : undefined;
    const bloqueos = await readBloqueos({
      businessId: req.business.id,
      fecha,
      professionalId: Number.isFinite(professionalId) ? professionalId : undefined,
    });
    res.json(bloqueos);
  } catch (error) { next(error); }
});

app.get("/api/:slug/mis-reservas", resolveBusiness, async (req, res, next) => {
  try {
    const telefono = (req.query.telefono || "").replace(/\D/g, "");
    if (!telefono || telefono.length < 6 || telefono.length > 15) {
      return res.status(400).json({ error: "Teléfono inválido." });
    }
    const now = new Date();
    const tz = now.getTimezoneOffset() * 60000;
    const todayStr = new Date(now - tz).toISOString().split("T")[0];
    let rows;
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, service_id, professional_id, fecha, hora_inicio, hora_fin, duracion_min, estado, nombre, cancel_token")
        .eq("business_id", req.business.id)
        .eq("telefono", telefono)
        .gte("fecha", todayStr)
        .neq("estado", "cancelada")
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true });
      if (error) throw new Error(error.message);
      rows = data;
    } else {
      rows = await dbAll(
        `SELECT id, service_id, professional_id, fecha, hora_inicio, hora_fin, duracion_min, estado, nombre, cancel_token
         FROM appointments
         WHERE business_id = ? AND telefono = ? AND fecha >= ? AND estado != 'cancelada'
         ORDER BY fecha ASC, hora_inicio ASC`,
        [req.business.id, telefono, todayStr]
      );
    }
    res.json((rows || []).map((r) => ({
      id: r.id,
      serviceId: r.service_id,
      professionalId: r.professional_id,
      fecha: r.fecha,
      horaInicio: r.hora_inicio,
      horaFin: r.hora_fin,
      duracionMin: r.duracion_min,
      estado: r.estado,
      nombre: r.nombre,
      cancelToken: r.cancel_token,
    })));
  } catch (error) { next(error); }
});

app.post("/api/:slug/reservas", resolveBusiness, upload.single("comprobante"), async (req, res, next) => {
  try {
    await purgeExpiredAppointments(req.business.id);

    const nombre = (req.body?.nombre || "").trim();
    const telefono = (req.body?.telefono || "").trim();
    const fecha = (req.body?.fecha || "").trim();
    const horaInicio = (req.body?.horaInicio || req.body?.horario || "").trim();
    const serviceId = Number(req.body?.serviceId);

    if (!nombre || nombre.length < 3) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (nombre.length > 100) return res.status(400).json({ error: "El nombre no puede superar 100 caracteres." });
    if (!telefono || telefono.length < 6) return res.status(400).json({ error: "El teléfono es obligatorio." });
    if (telefono.length > 30) return res.status(400).json({ error: "El teléfono es inválido." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha inválida." });
    if (!/^\d{2}:\d{2}$/.test(horaInicio)) return res.status(400).json({ error: "Horario inválido." });
    if (!Number.isFinite(serviceId)) return res.status(400).json({ error: "Servicio inválido." });
    if (!req.file) return res.status(400).json({ error: "Debés subir un comprobante." });

    const validMagic = await validateFileMagicBytes(req.file);
    if (!validMagic) {
      if (req.file.path) fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: "El archivo no es válido. Solo JPG, PNG, WEBP o PDF." });
    }

    const service = await getServiceById(req.business.id, serviceId);
    if (!service || !service.activo) return res.status(404).json({ error: "Servicio no encontrado." });

    const { professionalId, error: proError } = resolveProfessionalForBooking(
      req.business,
      req.body?.professionalId,
      serviceId
    );
    if (proError) return res.status(400).json({ error: proError });

    if (!isBusinessOpenOnDate(req.business, fecha, professionalId)) {
      return res.status(400).json({
        error: professionalId == null
          ? "Ese día el local no atiende."
          : "Ese día no hay atención para el profesional elegido.",
      });
    }
    if (!isServiceAvailableOnDate(service, fecha)) {
      return res.status(400).json({ error: "Ese día no se realiza este servicio." });
    }

    const duracionMin = Number(service.duracion_min);
    const startMin = timeToMinutes(horaInicio);
    if (startMin == null) return res.status(400).json({ error: "Horario inválido." });
    const endMin = startMin + duracionMin;
    if (!fitsBusinessOpenRange(startMin, endMin, req.business, professionalId)) {
      return res.status(400).json({ error: "El turno supera el horario de cierre." });
    }
    const horaFin = minutesToTime(endMin);

    if (toAppointmentTimestamp(fecha, horaInicio) < Date.now()) {
      return res.status(400).json({ error: "Ese horario ya pasó. Elegí uno actual o futuro." });
    }

    const [appointments, bloqueos] = await Promise.all([
      readAppointments({ businessId: req.business.id, fecha }),
      readBloqueos({ businessId: req.business.id, fecha, professionalId: professionalId ?? undefined }),
    ]);

    const available = generateAvailableSlots(duracionMin, appointments, bloqueos, professionalId, req.business);
    if (!available.includes(horaInicio)) {
      return res.status(409).json({ error: "Ese horario no está disponible. Elegí otro." });
    }

    const cancelToken = generateCancelToken();
    const creadoEn = new Date().toISOString();
    const businessId = req.business.id;
    let comprobanteArchivo;
    let appointmentId;

    if (USE_SUPABASE) {
      const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
      const storagePath = `${businessId}/${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET).upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      comprobanteArchivo = storagePath;
      const { data: insertData, error: insertError } = await supabase.from("appointments").insert({
        business_id: businessId,
        service_id: serviceId,
        professional_id: professionalId,
        nombre,
        telefono,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        duracion_min: duracionMin,
        estado: "confirmada",
        cancel_token: cancelToken,
        comprobante_nombre_original: req.file.originalname,
        comprobante_archivo: storagePath,
        comprobante_mimetype: req.file.mimetype,
        comprobante_size: req.file.size,
        creado_en: creadoEn,
      }).select().single();
      if (insertError) throw new Error(insertError.message);
      appointmentId = insertData.id;
    } else {
      comprobanteArchivo = req.file.filename;
      const insertResult = await dbRun(
        `INSERT INTO appointments (
           business_id, service_id, professional_id, nombre, telefono, fecha,
           hora_inicio, hora_fin, duracion_min, estado, cancel_token,
           comprobante_nombre_original, comprobante_archivo, comprobante_mimetype,
           comprobante_size, creado_en
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmada', ?, ?, ?, ?, ?, ?)`,
        [
          businessId, serviceId, professionalId, nombre, telefono, fecha,
          horaInicio, horaFin, duracionMin, cancelToken,
          req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, creadoEn,
        ]
      );
      appointmentId = insertResult.lastID;
    }

    // Ingreso automático en caja (seña / pago del turno)
    try {
      await createIngresoTurnoMovimiento({
        businessId,
        appointmentId,
        nombre,
        serviceNombre: service.nombre,
        fecha,
        horaInicio,
        monto: appointmentPaymentAmount(service, req.business),
        creadoEn,
      });
    } catch (movErr) {
      console.warn("[movimientos] ingreso de turno no creado:", movErr.message || movErr);
    }

    const comprobanteUrl = comprobantePublicUrl(req, comprobanteArchivo);
    const serviceNombre = service.nombre;
    const proNombre = professionalId
      ? (req.business.professionals.find((p) => Number(p.id) === Number(professionalId))?.nombre || "")
      : "";
    const waText = [
      `Hola! Reservé un turno en ${req.business.nombre}.`,
      `Nombre: ${nombre}`,
      `Servicio: ${serviceNombre}`,
      proNombre ? `Profesional: ${proNombre}` : null,
      `Fecha: ${fecha}`,
      `Horario: ${horaInicio} - ${horaFin}`,
      `Comprobante: ${comprobanteUrl}`,
    ].filter(Boolean).join("\n");

    return res.status(201).json({
      id: appointmentId,
      nombre,
      telefono,
      serviceId,
      professionalId,
      fecha,
      horaInicio,
      horaFin,
      duracionMin,
      estado: "confirmada",
      cancelToken,
      comprobante: {
        nombreOriginal: req.file.originalname,
        archivo: comprobanteArchivo,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
      creadoEn,
      comprobanteUrl,
      whatsappNumero: req.business.whatsapp,
      whatsappUrl: buildWhatsAppUrl(req.business.whatsapp, waText),
    });
  } catch (error) { next(error); }
});

async function cancelAppointmentByToken(req, res, next) {
  try {
    const token = (req.params.token || "").trim();
    if (!token || token.length < 16) return res.status(400).json({ error: "Token inválido." });

    let row;
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("appointments").select("*")
        .eq("cancel_token", token).eq("business_id", req.business.id).maybeSingle();
      if (error) throw new Error(error.message);
      row = data;
    } else {
      row = await dbGet(
        "SELECT * FROM appointments WHERE cancel_token = ? AND business_id = ? LIMIT 1",
        [token, req.business.id]
      );
    }
    if (!row) return res.status(404).json({ error: "Turno no encontrado." });
    if (row.estado === "cancelada") return res.json({ ok: true, alreadyCancelled: true });

    if (USE_SUPABASE) {
      const { error } = await supabase.from("appointments")
        .update({ estado: "cancelada" }).eq("id", row.id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
    } else {
      await dbRun(
        "UPDATE appointments SET estado = 'cancelada' WHERE id = ? AND business_id = ?",
        [row.id, req.business.id]
      );
    }
    return res.json({ ok: true, id: row.id });
  } catch (error) { next(error); }
}

app.get("/api/:slug/cancelar/:token", resolveBusiness, cancelAppointmentByToken);
app.post("/api/:slug/cancelar/:token", resolveBusiness, cancelAppointmentByToken);

// ============================================================
// ADMIN AUTH
// ============================================================
app.post("/api/:slug/admin/login", resolveBusiness, async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const rlKey = `admin:${ip}:${req.business.id}`;
    if (!checkLoginRateLimit(rlKey)) {
      return res.status(429).json({ error: "Demasiados intentos. Esperá 15 minutos." });
    }
    const password = (req.body?.password || "").trim();
    if (!password) return res.status(401).json({ error: "Clave de admin incorrecta." });
    const ok = await verifyAdminPasswordForBusiness(password, req.business.id);
    if (!ok) return res.status(401).json({ error: "Clave de admin incorrecta." });
    resetLoginRateLimit(rlKey);
    const token = createAdminSession(req.business.id);
    return res.json({ token, expiresInMs: ADMIN_SESSION_TTL_MS, businessId: req.business.id });
  } catch (error) { return next(error); }
});

// ============================================================
// ADMIN: APPOINTMENTS
// ============================================================
app.get("/api/:slug/admin/reservas", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    await purgeExpiredAppointments(req.business.id);
    const fecha = (req.query.fecha || "").trim();
    const appointments = await readAppointments({
      businessId: req.business.id,
      fecha: fecha || undefined,
      includeCanceladas: true,
    });
    res.json(appointments.map((a) => {
      const archivo = a.comprobante?.archivo;
      const isManual = !archivo || archivo === "manual" || archivo === "-";
      return {
        ...a,
        manual: isManual,
        comprobanteUrl: isManual
          ? null
          : USE_SUPABASE
            ? supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(archivo).data.publicUrl
            : `/uploads/${archivo}`,
      };
    }));
  } catch (error) { next(error); }
});

/** Snapshot liviano para panel en tiempo real (una sola request). */
app.get("/api/:slug/admin/live", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    await purgeExpiredAppointments(req.business.id);
    const fecha = (req.query.fecha || "").trim();
    const [appointments, bloqueos, bloqueosRecurrentes, movimientosRaw] = await Promise.all([
      readAppointments({
        businessId: req.business.id,
        fecha: fecha || undefined,
        includeCanceladas: true,
      }),
      readBloqueos({ businessId: req.business.id }),
      readBloqueosRecurrentes({ businessId: req.business.id }),
      listMovimientosRaw(req.business.id),
    ]);

    const reservas = appointments.map((a) => {
      const archivo = a.comprobante?.archivo;
      const isManual = !archivo || archivo === "manual" || archivo === "-";
      return {
        ...a,
        manual: isManual,
        comprobanteUrl: isManual
          ? null
          : USE_SUPABASE
            ? supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(archivo).data.publicUrl
            : `/uploads/${archivo}`,
      };
    });

    res.json({
      reservas,
      bloqueos,
      bloqueosRecurrentes,
      movimientos: (movimientosRaw || []).map(mapMovimientoRow),
      serverTime: new Date().toISOString(),
    });
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/reservas", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    const telefono = String(req.body?.telefono || "").replace(/\D/g, "");
    const fecha = String(req.body?.fecha || "").trim();
    const horaInicio = String(req.body?.horaInicio || req.body?.horario || "").trim();
    const serviceId = Number(req.body?.serviceId);
    const estadoRaw = String(req.body?.estado || "confirmada").trim().toLowerCase();
    const estado = ESTADOS_TURNO.has(estadoRaw) && estadoRaw !== "cancelada" ? estadoRaw : "confirmada";

    if (!nombre || nombre.length < 2) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (nombre.length > 100) return res.status(400).json({ error: "El nombre no puede superar 100 caracteres." });
    if (!telefono || telefono.length < 6 || telefono.length > 15) {
      return res.status(400).json({ error: "Teléfono inválido (solo números)." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha inválida." });
    if (!/^\d{2}:\d{2}$/.test(horaInicio)) return res.status(400).json({ error: "Horario inválido." });
    if (!Number.isFinite(serviceId)) return res.status(400).json({ error: "Servicio inválido." });

    const service = await getServiceById(req.business.id, serviceId);
    if (!service || !service.activo) return res.status(404).json({ error: "Servicio no encontrado." });

    const { professionalId, error: proError } = resolveProfessionalForBooking(
      req.business,
      req.body?.professionalId,
      serviceId
    );
    if (proError) return res.status(400).json({ error: proError });

    if (!isBusinessOpenOnDate(req.business, fecha, professionalId)) {
      return res.status(400).json({
        error: professionalId == null
          ? "Ese día el local no atiende."
          : "Ese día no hay atención para el profesional elegido.",
      });
    }
    if (!isServiceAvailableOnDate(service, fecha)) {
      return res.status(400).json({ error: "Ese día no se realiza este servicio." });
    }

    const duracionMin = Number(service.duracion_min);
    if (!Number.isFinite(duracionMin) || duracionMin <= 0) {
      return res.status(400).json({ error: "Duración de servicio inválida." });
    }
    const startMin = timeToMinutes(horaInicio);
    if (startMin == null) return res.status(400).json({ error: "Horario inválido." });
    if (!fitsBusinessOpenRange(startMin, startMin + duracionMin, req.business, professionalId)) {
      return res.status(400).json({ error: "El turno supera el horario de cierre." });
    }
    const horaFin = minutesToTime(startMin + duracionMin);

    const [appointments, bloqueos] = await Promise.all([
      readAppointments({ businessId: req.business.id, fecha }),
      readBloqueos({ businessId: req.business.id, fecha, professionalId: professionalId ?? undefined }),
    ]);
    const available = generateAvailableSlots(
      duracionMin,
      appointments,
      bloqueos,
      professionalId,
      req.business
    );
    if (!available.includes(horaInicio)) {
      return res.status(409).json({ error: "Ese horario no está disponible (turno o bloqueo)." });
    }

    const cancelToken = generateCancelToken();
    const creadoEn = new Date().toISOString();
    const businessId = req.business.id;
    const comprobante = {
      nombreOriginal: "manual",
      archivo: "manual",
      mimetype: "text/plain",
      size: 0,
    };

    let appointmentId;
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("appointments").insert({
        business_id: businessId,
        service_id: serviceId,
        professional_id: professionalId,
        nombre,
        telefono,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        duracion_min: duracionMin,
        estado,
        cancel_token: cancelToken,
        comprobante_nombre_original: comprobante.nombreOriginal,
        comprobante_archivo: comprobante.archivo,
        comprobante_mimetype: comprobante.mimetype,
        comprobante_size: comprobante.size,
        creado_en: creadoEn,
      }).select().single();
      if (error) throw new Error(error.message);
      appointmentId = data.id;
    } else {
      const insertResult = await dbRun(
        `INSERT INTO appointments (
           business_id, service_id, professional_id, nombre, telefono, fecha,
           hora_inicio, hora_fin, duracion_min, estado, cancel_token,
           comprobante_nombre_original, comprobante_archivo, comprobante_mimetype,
           comprobante_size, creado_en
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, serviceId, professionalId, nombre, telefono, fecha,
          horaInicio, horaFin, duracionMin, estado, cancelToken,
          comprobante.nombreOriginal, comprobante.archivo, comprobante.mimetype, comprobante.size, creadoEn,
        ]
      );
      appointmentId = insertResult.lastID;
    }

    try {
      await createIngresoTurnoMovimiento({
        businessId,
        appointmentId,
        nombre,
        serviceNombre: service.nombre,
        fecha,
        horaInicio,
        monto: appointmentPaymentAmount(mapServiceRow(service), req.business),
        creadoEn,
      });
    } catch (movErr) {
      console.warn("[movimientos] ingreso manual no creado:", movErr.message || movErr);
    }

    return res.status(201).json({
      id: appointmentId,
      businessId,
      serviceId,
      professionalId,
      nombre,
      telefono,
      fecha,
      horaInicio,
      horaFin,
      duracionMin,
      estado,
      cancelToken,
      manual: true,
      comprobanteUrl: null,
      creadoEn,
    });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/reservas/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const appointments = await readAppointments({ businessId: req.business.id, includeCanceladas: true });
    const eliminada = appointments.find((a) => Number(a.id) === id);
    if (!eliminada) return res.status(404).json({ error: "Turno no encontrado." });

    const archivo = eliminada.comprobante?.archivo;
    const isManual = !archivo || archivo === "manual" || archivo === "-";

    if (USE_SUPABASE) {
      if (!isManual) {
        await supabase.storage.from(SUPABASE_BUCKET).remove([archivo]);
      }
      const { error } = await supabase.from("appointments").delete().eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
    } else {
      await dbRun("DELETE FROM appointments WHERE id = ? AND business_id = ?", [id, req.business.id]);
      if (!isManual && archivo) {
        fs.unlink(path.join(UPLOADS_DIR, archivo)).catch(() => {});
      }
    }
    return res.json({ ok: true, appointment: eliminada });
  } catch (error) { next(error); }
});

app.patch("/api/:slug/admin/reservas/:id/estado", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const estado = (req.body?.estado || "").trim();
    if (!ESTADOS_TURNO.has(estado)) return res.status(400).json({ error: "Estado inválido." });

    if (USE_SUPABASE) {
      const { error } = await supabase.from("appointments")
        .update({ estado }).eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    const result = await dbRun(
      "UPDATE appointments SET estado = ? WHERE id = ? AND business_id = ?",
      [estado, id, req.business.id]
    );
    if (!result.changes) return res.status(404).json({ error: "Turno no encontrado." });
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

app.patch("/api/:slug/admin/reservas/:id/horario", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const fecha = String(req.body?.fecha || "").trim();
    const horaInicio = String(req.body?.horaInicio || req.body?.horario || "").trim();
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha inválida." });
    if (!/^\d{2}:\d{2}$/.test(horaInicio)) return res.status(400).json({ error: "Horario inválido." });

    let appt;
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("appointments").select("*")
        .eq("id", id).eq("business_id", req.business.id).maybeSingle();
      if (error) throw new Error(error.message);
      appt = data ? mapAppointmentRow(data) : null;
    } else {
      const row = await dbGet(
        "SELECT * FROM appointments WHERE id = ? AND business_id = ? LIMIT 1",
        [id, req.business.id]
      );
      appt = row ? mapAppointmentRow(row) : null;
    }
    if (!appt) return res.status(404).json({ error: "Turno no encontrado." });
    if (appt.estado === "cancelada") {
      return res.status(400).json({ error: "No se puede modificar un turno cancelado." });
    }

    const service = await getServiceById(req.business.id, appt.serviceId);
    if (!service || !service.activo) return res.status(404).json({ error: "Servicio no encontrado." });

    const professionalId = appt.professionalId ?? null;
    if (!isBusinessOpenOnDate(req.business, fecha, professionalId)) {
      return res.status(400).json({ error: "Ese día no hay atención para el profesional del turno." });
    }
    if (!isServiceAvailableOnDate(service, fecha)) {
      return res.status(400).json({ error: "Ese día no se realiza este servicio." });
    }

    const duracionMin = Number(service.duracion_min) || Number(appt.duracionMin) || 30;
    const startMin = timeToMinutes(horaInicio);
    if (startMin == null) return res.status(400).json({ error: "Horario inválido." });
    const endMin = startMin + duracionMin;
    if (!fitsBusinessOpenRange(startMin, endMin, req.business, professionalId)) {
      return res.status(400).json({ error: "El turno supera el horario de cierre." });
    }
    const horaFin = minutesToTime(endMin);

    const [appointments, bloqueos] = await Promise.all([
      readAppointments({ businessId: req.business.id, fecha }),
      readBloqueos({ businessId: req.business.id, fecha, professionalId: professionalId ?? undefined }),
    ]);
    const available = generateAvailableSlots(
      duracionMin,
      appointments,
      bloqueos,
      professionalId,
      req.business,
      { excludeAppointmentId: id }
    );
    if (!available.includes(horaInicio)) {
      return res.status(409).json({ error: "Ese horario no está disponible. Elegí otro." });
    }

    if (USE_SUPABASE) {
      const { error } = await supabase.from("appointments").update({
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        duracion_min: duracionMin,
      }).eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
    } else {
      await dbRun(
        `UPDATE appointments SET fecha = ?, hora_inicio = ?, hora_fin = ?, duracion_min = ?
         WHERE id = ? AND business_id = ?`,
        [fecha, horaInicio, horaFin, duracionMin, id, req.business.id]
      );
    }
    return res.json({ ok: true, fecha, horaInicio, horaFin });
  } catch (error) { next(error); }
});

// ============================================================
// ADMIN: BLOQUEOS
// ============================================================
app.get("/api/:slug/admin/bloqueos", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    res.json(await readBloqueos({ businessId: req.business.id }));
  } catch (error) { next(error); }
});

app.get("/api/:slug/admin/bloqueos-recurrentes", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    res.json(await readBloqueosRecurrentes({ businessId: req.business.id }));
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/bloqueos-recurrentes", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const diaSemana = parseInt(req.body.diaSemana, 10);
    const horarioDesde = (req.body.horarioDesde || "").trim();
    const horarioHasta = (req.body.horarioHasta || "").trim();
    const diaCompleto = Boolean(req.body.diaCompleto);
    const motivo = (req.body.motivo || "").trim().slice(0, 200);
    let professionalId = req.body.professionalId != null && req.body.professionalId !== ""
      ? Number(req.body.professionalId)
      : null;
    if (professionalId != null && !Number.isFinite(professionalId)) {
      return res.status(400).json({ error: "Profesional inválido." });
    }
    if (professionalId != null && !req.business.professionals.some((p) => Number(p.id) === professionalId)) {
      return res.status(400).json({ error: "Profesional inválido." });
    }
    if (![0, 1, 2, 3, 4, 5, 6].includes(diaSemana)) {
      return res.status(400).json({ error: "Día de semana inválido." });
    }
    if (!diaCompleto && (!horarioDesde || !horarioHasta)) {
      return res.status(400).json({ error: "Indicá horario desde y hasta." });
    }

    const propuesto = {
      professionalId,
      diaCompleto,
      horarioDesde: diaCompleto ? null : horarioDesde,
      horarioHasta: diaCompleto ? null : horarioHasta,
    };

    const appointments = await readAppointments({
      businessId: req.business.id,
      includeCanceladas: false,
    });
    const now = new Date();
    const tz = now.getTimezoneOffset() * 60000;
    const todayStr = new Date(now - tz).toISOString().split("T")[0];
    const conflictos = appointments.filter((a) => {
      if (!a.fecha || a.fecha < todayStr) return false;
      const [y, m, d] = String(a.fecha).split("-").map(Number);
      if (new Date(y, m - 1, d).getDay() !== diaSemana) return false;
      return appointmentOverlapsBloqueo(a, propuesto, req.business);
    });
    if (conflictos.length) {
      return res.status(409).json({ error: conflictErrorBloqueoVsTurnos(conflictos) });
    }

    const creadoEn = new Date().toISOString();
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("bloqueos_recurrentes").insert({
        business_id: req.business.id,
        professional_id: professionalId,
        dia_semana: diaSemana,
        horario_desde: diaCompleto ? null : horarioDesde,
        horario_hasta: diaCompleto ? null : horarioHasta,
        dia_completo: diaCompleto,
        motivo,
        activo: true,
        creado_en: creadoEn,
      }).select().single();
      if (error) throw new Error(error.message);
      return res.status(201).json(mapBloqueoRecurrenteRow(data));
    }
    const result = await dbRun(
      `INSERT INTO bloqueos_recurrentes
         (business_id, professional_id, dia_semana, horario_desde, horario_hasta, dia_completo, motivo, activo, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        req.business.id, professionalId, diaSemana,
        diaCompleto ? null : horarioDesde, diaCompleto ? null : horarioHasta,
        diaCompleto ? 1 : 0, motivo, creadoEn,
      ]
    );
    res.status(201).json({
      id: result.lastID, businessId: req.business.id, professionalId, diaSemana,
      horarioDesde, horarioHasta, diaCompleto, motivo, activo: true, creadoEn,
    });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/bloqueos-recurrentes/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });
    if (USE_SUPABASE) {
      const { error } = await supabase.from("bloqueos_recurrentes")
        .delete().eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
    } else {
      await dbRun("DELETE FROM bloqueos_recurrentes WHERE id = ? AND business_id = ?", [id, req.business.id]);
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/bloqueos", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const fecha = (req.body.fecha || "").trim();
    const horario = (req.body.horario || "").trim();
    const horarioDesde = (req.body.horarioDesde || "").trim();
    const horarioHasta = (req.body.horarioHasta || "").trim();
    const motivo = ((req.body.motivo || "").trim() || "Bloqueado por administración").slice(0, 300);
    const diaCompleto = Boolean(req.body.diaCompleto);
    let professionalId = req.body.professionalId != null && req.body.professionalId !== ""
      ? Number(req.body.professionalId)
      : null;
    if (professionalId != null && !Number.isFinite(professionalId)) {
      return res.status(400).json({ error: "Profesional inválido." });
    }
    if (professionalId != null && !req.business.professionals.some((p) => Number(p.id) === professionalId)) {
      return res.status(400).json({ error: "Profesional inválido." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha inválida." });

    const tieneRango = Boolean(horarioDesde && horarioHasta);
    if (!diaCompleto && tieneRango) {
      if (timeToMinutes(horarioDesde) == null || timeToMinutes(horarioHasta) == null) {
        return res.status(400).json({ error: "Rango horario inválido." });
      }
      if (timeToMinutes(horarioDesde) > timeToMinutes(horarioHasta)) {
        return res.status(400).json({ error: "El horario desde no puede ser mayor al hasta." });
      }
    } else if (!diaCompleto && horario && timeToMinutes(horario) == null) {
      return res.status(400).json({ error: "Horario inválido." });
    } else if (!diaCompleto && !tieneRango && !horario) {
      return res.status(400).json({ error: "Indicá horario o rango." });
    }

    const nuevoBloqueo = {
      professionalId,
      fecha,
      diaCompleto,
      horario: diaCompleto ? null : tieneRango ? null : horario,
      horarioDesde: diaCompleto ? null : tieneRango ? horarioDesde : null,
      horarioHasta: diaCompleto ? null : tieneRango ? horarioHasta : null,
    };

    const bloqueos = await readBloqueos({ businessId: req.business.id, fecha });
    const yaExiste = bloqueos.some((b) => {
      const samePro = (b.professionalId == null && professionalId == null)
        || (b.professionalId != null && professionalId != null && Number(b.professionalId) === Number(professionalId));
      return samePro && b.fecha === fecha && bloqueosSeSuperponen(b, nuevoBloqueo, req.business);
    });
    if (yaExiste) return res.status(409).json({ error: "Ese bloqueo se superpone con otro ya existente." });

    const appointments = await readAppointments({
      businessId: req.business.id,
      fecha,
      includeCanceladas: false,
    });
    const conflictos = appointments.filter((a) =>
      appointmentOverlapsBloqueo(a, nuevoBloqueo, req.business)
    );
    if (conflictos.length) {
      return res.status(409).json({ error: conflictErrorBloqueoVsTurnos(conflictos) });
    }

    const creadoEn = new Date().toISOString();
    let bloqueoId;
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("bloqueos").insert({
        business_id: req.business.id,
        professional_id: professionalId,
        fecha,
        horario: nuevoBloqueo.horario,
        horario_desde: nuevoBloqueo.horarioDesde,
        horario_hasta: nuevoBloqueo.horarioHasta,
        dia_completo: diaCompleto,
        motivo,
        creado_en: creadoEn,
      }).select().single();
      if (error) throw new Error(error.message);
      bloqueoId = data.id;
    } else {
      const insertResult = await dbRun(
        `INSERT INTO bloqueos
           (business_id, professional_id, fecha, horario, horario_desde, horario_hasta, dia_completo, motivo, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.business.id, professionalId, fecha, nuevoBloqueo.horario,
          nuevoBloqueo.horarioDesde, nuevoBloqueo.horarioHasta, diaCompleto ? 1 : 0, motivo, creadoEn,
        ]
      );
      bloqueoId = insertResult.lastID;
    }

    return res.status(201).json({
      id: bloqueoId,
      businessId: req.business.id,
      professionalId,
      fecha,
      horario: nuevoBloqueo.horario,
      horarioDesde: nuevoBloqueo.horarioDesde,
      horarioHasta: nuevoBloqueo.horarioHasta,
      diaCompleto,
      motivo,
      creadoEn,
    });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/bloqueos/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const bloqueos = await readBloqueos({ businessId: req.business.id });
    const eliminado = bloqueos.find((b) => Number(b.id) === id);
    if (!eliminado) return res.status(404).json({ error: "Bloqueo no encontrado." });

    if (USE_SUPABASE) {
      const { error } = await supabase.from("bloqueos").delete().eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
    } else {
      await dbRun("DELETE FROM bloqueos WHERE id = ? AND business_id = ?", [id, req.business.id]);
    }
    return res.json({ ok: true, bloqueo: eliminado });
  } catch (error) { next(error); }
});

// ============================================================
// ADMIN: PROFESSIONALS
// ============================================================
app.get("/api/:slug/admin/professionals", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("professionals").select("*")
        .eq("business_id", req.business.id).order("id");
      if (error) throw new Error(error.message);
      return res.json(await attachServiceIdsToProfessionals(req.business.id, data || []));
    }
    const rows = await dbAll(
      "SELECT * FROM professionals WHERE business_id = ? ORDER BY id ASC",
      [req.business.id]
    );
    return res.json(await attachServiceIdsToProfessionals(req.business.id, rows));
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/professionals", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const { nombre, especialidad, matricula, bio } = parseProfessionalProfile(req.body);
    const schedule = parseProfessionalSchedule(req.body);
    const serviceIds = parseServiceIds(req.body?.serviceIds);
    if (!nombre) return res.status(400).json({ error: "El nombre del profesional es obligatorio." });
    if (nombre.length > 100) return res.status(400).json({ error: "El nombre es demasiado largo." });
    if (!serviceIds.length) {
      return res.status(400).json({ error: "Seleccioná al menos un servicio para este profesional." });
    }

    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("professionals")
        .insert({
          business_id: req.business.id,
          nombre,
          especialidad,
          matricula,
          bio,
          activo: true,
          hora_inicio: schedule.horaInicio,
          hora_fin: schedule.horaFin,
          hora_inicio_2: schedule.horaInicio2,
          hora_fin_2: schedule.horaFin2,
          dias_atencion: schedule.diasAtencionCsv,
        }).select().single();
      if (error) throw new Error(error.message);
      const linked = await syncProfessionalServices(req.business.id, data.id, serviceIds);
      return res.status(201).json({ ...mapProfessionalRow(data), serviceIds: linked });
    }
    const result = await dbRun(
      `INSERT INTO professionals (
         business_id, nombre, especialidad, matricula, bio, activo,
         hora_inicio, hora_fin, hora_inicio_2, hora_fin_2, dias_atencion
       ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        req.business.id, nombre, especialidad, matricula, bio,
        schedule.horaInicio, schedule.horaFin, schedule.horaInicio2, schedule.horaFin2,
        schedule.diasAtencionCsv,
      ]
    );
    const linked = await syncProfessionalServices(req.business.id, result.lastID, serviceIds);
    return res.status(201).json({
      id: result.lastID,
      businessId: req.business.id,
      nombre,
      especialidad,
      matricula,
      bio,
      fotoUrl: null,
      activo: true,
      horarioPropio: schedule.horarioPropio,
      horaInicio: schedule.horaInicio,
      horaFin: schedule.horaFin,
      horaInicio2: schedule.horaInicio2,
      horaFin2: schedule.horaFin2,
      diasAtencion: schedule.diasAtencionCsv ? parseDiasAtencion(schedule.diasAtencionCsv) : null,
      serviceIds: linked,
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    next(error);
  }
});

app.put("/api/:slug/admin/professionals/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nombre, especialidad, matricula, bio } = parseProfessionalProfile(req.body);
    const hasSchedule = Object.prototype.hasOwnProperty.call(req.body || {}, "horarioPropio");
    const schedule = hasSchedule ? parseProfessionalSchedule(req.body) : null;
    const activo = req.body?.activo;
    const hasServiceIds = Array.isArray(req.body?.serviceIds);
    const serviceIds = hasServiceIds ? parseServiceIds(req.body.serviceIds) : null;
    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (nombre.length > 100) return res.status(400).json({ error: "El nombre es demasiado largo." });
    if (hasServiceIds && !serviceIds.length && activo !== false) {
      return res.status(400).json({ error: "Seleccioná al menos un servicio para este profesional." });
    }

    if (USE_SUPABASE) {
      const patch = { nombre, especialidad, matricula, bio };
      if (typeof activo === "boolean") patch.activo = activo;
      if (schedule) {
        patch.hora_inicio = schedule.horaInicio;
        patch.hora_fin = schedule.horaFin;
        patch.hora_inicio_2 = schedule.horaInicio2;
        patch.hora_fin_2 = schedule.horaFin2;
        patch.dias_atencion = schedule.diasAtencionCsv;
      }
      const { error } = await supabase.from("professionals").update(patch)
        .eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      if (hasServiceIds) await syncProfessionalServices(req.business.id, id, serviceIds);
      return res.json({ ok: true });
    }
    if (schedule) {
      await dbRun(
        `UPDATE professionals SET nombre = ?, especialidad = ?, matricula = ?, bio = ?,
           hora_inicio = ?, hora_fin = ?, hora_inicio_2 = ?, hora_fin_2 = ?, dias_atencion = ?,
           activo = COALESCE(?, activo)
         WHERE id = ? AND business_id = ?`,
        [
          nombre, especialidad, matricula, bio,
          schedule.horaInicio, schedule.horaFin, schedule.horaInicio2, schedule.horaFin2,
          schedule.diasAtencionCsv,
          typeof activo === "boolean" ? (activo ? 1 : 0) : null,
          id, req.business.id,
        ]
      );
    } else if (typeof activo === "boolean") {
      await dbRun(
        `UPDATE professionals SET nombre = ?, especialidad = ?, matricula = ?, bio = ?, activo = ?
         WHERE id = ? AND business_id = ?`,
        [nombre, especialidad, matricula, bio, activo ? 1 : 0, id, req.business.id]
      );
    } else {
      await dbRun(
        `UPDATE professionals SET nombre = ?, especialidad = ?, matricula = ?, bio = ?
         WHERE id = ? AND business_id = ?`,
        [nombre, especialidad, matricula, bio, id, req.business.id]
      );
    }
    if (hasServiceIds) await syncProfessionalServices(req.business.id, id, serviceIds);
    return res.json({ ok: true });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    next(error);
  }
});

app.patch("/api/:slug/admin/professionals/:id/foto", resolveBusiness, requireAdmin, logoUpload.single("foto"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });
    if (!req.file) return res.status(400).json({ error: "No se recibió imagen." });
    const validMagic = await validateFileMagicBytes(req.file);
    if (!validMagic) return res.status(400).json({ error: "Imagen inválida." });

    if (USE_SUPABASE) {
      const { data: pro } = await supabase.from("professionals").select("id")
        .eq("id", id).eq("business_id", req.business.id).maybeSingle();
      if (!pro) return res.status(404).json({ error: "Profesional no encontrado." });
    } else {
      const pro = await dbGet(
        "SELECT id FROM professionals WHERE id = ? AND business_id = ? LIMIT 1",
        [id, req.business.id]
      );
      if (!pro) return res.status(404).json({ error: "Profesional no encontrado." });
    }

    const fotoUrl = await uploadProfessionalFotoFile(req.business.id, id, req.file);
    return res.json({ ok: true, fotoUrl });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/professionals/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const hoy = new Date().toISOString().split("T")[0];

    if (USE_SUPABASE) {
      const { data: pro } = await supabase.from("professionals").select("*")
        .eq("id", id).eq("business_id", req.business.id).maybeSingle();
      if (!pro) return res.status(404).json({ error: "Profesional no encontrado." });
      const { data: futuras } = await supabase.from("appointments").select("id")
        .eq("business_id", req.business.id).eq("professional_id", id)
        .gte("fecha", hoy).neq("estado", "cancelada");
      if (futuras?.length) {
        return res.status(409).json({ error: `Tiene ${futuras.length} turno(s) futuro(s). Cancelalos primero.` });
      }
      await supabase.from("professionals").delete().eq("id", id).eq("business_id", req.business.id);
      return res.json({ ok: true });
    }
    const pro = await dbGet("SELECT * FROM professionals WHERE id = ? AND business_id = ?", [id, req.business.id]);
    if (!pro) return res.status(404).json({ error: "Profesional no encontrado." });
    const futuras = await dbAll(
      `SELECT id FROM appointments WHERE business_id = ? AND professional_id = ? AND fecha >= ? AND estado != 'cancelada'`,
      [req.business.id, id, hoy]
    );
    if (futuras.length) {
      return res.status(409).json({ error: `Tiene ${futuras.length} turno(s) futuro(s). Cancelalos primero.` });
    }
    await dbRun("DELETE FROM professionals WHERE id = ? AND business_id = ?", [id, req.business.id]);
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

// ============================================================
// ADMIN: SERVICES
// ============================================================
app.get("/api/:slug/admin/services", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("services").select("*")
        .eq("business_id", req.business.id).order("id");
      if (error) throw new Error(error.message);
      return res.json((data || []).map(mapServiceRow));
    }
    const rows = await dbAll("SELECT * FROM services WHERE business_id = ? ORDER BY id ASC", [req.business.id]);
    return res.json(rows.map(mapServiceRow));
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/services", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const nombre = (req.body?.nombre || "").trim();
    const descripcion = (req.body?.descripcion || "").trim();
    const duracionMin = parseInt(req.body?.duracionMin, 10);
    const precio = String(req.body?.precio ?? "0").trim();
    const sena = String(req.body?.sena ?? "0").trim();
    const categoria = (req.body?.categoria || "").trim() || null;
    const professionalId = req.body?.professionalId != null && req.body.professionalId !== ""
      ? Number(req.body.professionalId)
      : null;
    const diasAtencionInput = Array.isArray(req.body?.diasAtencion) ? req.body.diasAtencion : null;
    const diasAtencion = diasAtencionInput && diasAtencionInput.length ? serializeDiasAtencion(diasAtencionInput) : null;

    if (!nombre) return res.status(400).json({ error: "El nombre del servicio es obligatorio." });
    if (!Number.isFinite(duracionMin) || duracionMin < SLOT_STEP_MIN) {
      return res.status(400).json({ error: `La duración mínima es ${SLOT_STEP_MIN} minutos.` });
    }

    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("services").insert({
        business_id: req.business.id, nombre, descripcion, duracion_min: duracionMin,
        precio, sena, categoria, professional_id: professionalId, dias_atencion: diasAtencion, activo: true,
      }).select().single();
      if (error) throw new Error(error.message);
      if (professionalId) await ensureProfessionalServiceLink(req.business.id, data.id, professionalId);
      return res.status(201).json(mapServiceRow(data));
    }
    const result = await dbRun(
      `INSERT INTO services (business_id, nombre, descripcion, duracion_min, precio, sena, categoria, professional_id, dias_atencion, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [req.business.id, nombre, descripcion, duracionMin, precio, sena, categoria, professionalId, diasAtencion]
    );
    if (professionalId) await ensureProfessionalServiceLink(req.business.id, result.lastID, professionalId);
    return res.status(201).json({
      id: result.lastID, businessId: req.business.id, nombre, descripcion,
      duracionMin, precio, sena, categoria, professionalId, activo: true,
      diasAtencion: diasAtencion ? parseDiasAtencion(diasAtencion) : null,
    });
  } catch (error) { next(error); }
});

app.put("/api/:slug/admin/services/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const nombre = (req.body?.nombre || "").trim();
    const descripcion = (req.body?.descripcion || "").trim();
    const duracionMin = parseInt(req.body?.duracionMin, 10);
    const precio = String(req.body?.precio ?? "0").trim();
    const sena = String(req.body?.sena ?? "0").trim();
    const categoria = (req.body?.categoria || "").trim() || null;
    const activo = req.body?.activo;
    const professionalId = req.body?.professionalId != null && req.body.professionalId !== ""
      ? Number(req.body.professionalId)
      : null;
    const hasDiasAtencion = Object.prototype.hasOwnProperty.call(req.body || {}, "diasAtencion");
    const diasAtencionInput = Array.isArray(req.body?.diasAtencion) ? req.body.diasAtencion : null;
    const diasAtencion = diasAtencionInput && diasAtencionInput.length ? serializeDiasAtencion(diasAtencionInput) : null;

    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (!Number.isFinite(duracionMin) || duracionMin < SLOT_STEP_MIN) {
      return res.status(400).json({ error: `La duración mínima es ${SLOT_STEP_MIN} minutos.` });
    }

    if (USE_SUPABASE) {
      const patch = {
        nombre, descripcion, duracion_min: duracionMin, precio, sena, categoria, professional_id: professionalId,
      };
      if (typeof activo === "boolean") patch.activo = activo;
      if (hasDiasAtencion) patch.dias_atencion = diasAtencion;
      const { error } = await supabase.from("services").update(patch)
        .eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      if (professionalId) await ensureProfessionalServiceLink(req.business.id, id, professionalId);
      return res.json({ ok: true });
    }
    if (hasDiasAtencion) {
      await dbRun(
        `UPDATE services SET nombre=?, descripcion=?, duracion_min=?, precio=?, sena=?, categoria=?, professional_id=?, dias_atencion=?, activo=?
         WHERE id=? AND business_id=?`,
        [
          nombre, descripcion, duracionMin, precio, sena, categoria, professionalId, diasAtencion,
          typeof activo === "boolean" ? (activo ? 1 : 0) : 1,
          id, req.business.id,
        ]
      );
    } else {
      await dbRun(
        `UPDATE services SET nombre=?, descripcion=?, duracion_min=?, precio=?, sena=?, categoria=?, professional_id=?, activo=?
         WHERE id=? AND business_id=?`,
        [
          nombre, descripcion, duracionMin, precio, sena, categoria, professionalId,
          typeof activo === "boolean" ? (activo ? 1 : 0) : 1,
          id, req.business.id,
        ]
      );
    }
    if (professionalId) await ensureProfessionalServiceLink(req.business.id, id, professionalId);
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/services/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });
    const hoy = new Date().toISOString().split("T")[0];

    if (USE_SUPABASE) {
      const { data: svc } = await supabase.from("services").select("id")
        .eq("id", id).eq("business_id", req.business.id).maybeSingle();
      if (!svc) return res.status(404).json({ error: "Servicio no encontrado." });
      const { data: futuras } = await supabase.from("appointments").select("id")
        .eq("business_id", req.business.id).eq("service_id", id)
        .gte("fecha", hoy).neq("estado", "cancelada");
      if (futuras?.length) {
        return res.status(409).json({
          error: `Tiene ${futuras.length} turno(s) futuro(s). Cancelalos primero.`,
        });
      }
      const { data, error } = await supabase
        .from("services")
        .delete()
        .eq("id", id)
        .eq("business_id", req.business.id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) return res.status(404).json({ error: "Servicio no encontrado." });
      return res.json({ ok: true });
    }

    const svc = await dbGet(
      "SELECT id FROM services WHERE id = ? AND business_id = ? LIMIT 1",
      [id, req.business.id]
    );
    if (!svc) return res.status(404).json({ error: "Servicio no encontrado." });
    const futuras = await dbAll(
      `SELECT id FROM appointments WHERE business_id = ? AND service_id = ? AND fecha >= ? AND estado != 'cancelada'`,
      [req.business.id, id, hoy]
    );
    if (futuras.length) {
      return res.status(409).json({
        error: `Tiene ${futuras.length} turno(s) futuro(s). Cancelalos primero.`,
      });
    }
    // Liberar FKs de turnos pasados/cancelados (SQLite no tiene ON DELETE SET NULL)
    await dbRun(
      "UPDATE appointments SET service_id = NULL WHERE business_id = ? AND service_id = ?",
      [req.business.id, id]
    );
    await dbRun(
      "DELETE FROM professional_services WHERE business_id = ? AND service_id = ?",
      [req.business.id, id]
    );
    await dbRun("DELETE FROM services WHERE id = ? AND business_id = ?", [id, req.business.id]);
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

// ============================================================
// ADMIN: CLIENT PLANS
// ============================================================
app.get("/api/:slug/admin/plans", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("plans").select("*")
        .eq("business_id", req.business.id).order("id");
      if (error) throw new Error(error.message);
      return res.json((data || []).map(mapClientPlanRow));
    }
    const rows = await dbAll("SELECT * FROM plans WHERE business_id = ? ORDER BY id ASC", [req.business.id]);
    return res.json(rows.map(mapClientPlanRow));
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/plans", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const nombre = (req.body?.nombre || "").trim();
    const sesiones = parseInt(req.body?.sesiones, 10);
    const precio = String(req.body?.precio ?? "0").trim();
    const descripcion = (req.body?.descripcion || "").trim();
    if (!nombre) return res.status(400).json({ error: "El nombre del plan es obligatorio." });
    if (!Number.isFinite(sesiones) || sesiones < 1) {
      return res.status(400).json({ error: "Sesiones inválidas." });
    }

    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("plans").insert({
        business_id: req.business.id, nombre, sesiones, precio, descripcion, activo: true,
      }).select().single();
      if (error) throw new Error(error.message);
      return res.status(201).json(mapClientPlanRow(data));
    }
    const result = await dbRun(
      `INSERT INTO plans (business_id, nombre, sesiones, precio, descripcion, activo)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [req.business.id, nombre, sesiones, precio, descripcion]
    );
    return res.status(201).json({
      id: result.lastID, businessId: req.business.id, nombre, sesiones, precio, descripcion, activo: true,
    });
  } catch (error) { next(error); }
});

app.put("/api/:slug/admin/plans/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const nombre = (req.body?.nombre || "").trim();
    const sesiones = parseInt(req.body?.sesiones, 10);
    const precio = String(req.body?.precio ?? "0").trim();
    const descripcion = (req.body?.descripcion || "").trim();
    const activo = req.body?.activo;
    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (!Number.isFinite(sesiones) || sesiones < 1) {
      return res.status(400).json({ error: "Sesiones inválidas." });
    }

    if (USE_SUPABASE) {
      const patch = { nombre, sesiones, precio, descripcion };
      if (typeof activo === "boolean") patch.activo = activo;
      const { error } = await supabase.from("plans").update(patch)
        .eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    await dbRun(
      `UPDATE plans SET nombre=?, sesiones=?, precio=?, descripcion=?, activo=?
       WHERE id=? AND business_id=?`,
      [
        nombre, sesiones, precio, descripcion,
        typeof activo === "boolean" ? (activo ? 1 : 0) : 1,
        id, req.business.id,
      ]
    );
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/plans/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });

    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from("plans")
        .delete()
        .eq("id", id)
        .eq("business_id", req.business.id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) return res.status(404).json({ error: "Plan no encontrado." });
      return res.json({ ok: true });
    }
    const row = await dbGet(
      "SELECT id FROM plans WHERE id = ? AND business_id = ? LIMIT 1",
      [id, req.business.id]
    );
    if (!row) return res.status(404).json({ error: "Plan no encontrado." });
    await dbRun("DELETE FROM plans WHERE id = ? AND business_id = ?", [id, req.business.id]);
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

// ============================================================
// ADMIN: PRODUCTOS (market — línea propia Canito)
// ============================================================
const MISSING_PRODUCTOS_TABLE_MSG =
  "Todavía no corriste la migración del market en Supabase. Pedile a soporte el SQL de productos/pedidos.";

function parseProductoBody(body = {}) {
  const nombre = String(body.nombre || "").trim().slice(0, 120);
  const descripcion = String(body.descripcion || "").trim().slice(0, 1000) || null;
  const precioBase = parseMoneyAmount(body.precioBase ?? body.precio_base);
  const categoria = String(body.categoria || "").trim().slice(0, 60) || null;
  const stock = body.stock === "" || body.stock == null ? null : Math.max(0, Math.trunc(Number(body.stock) || 0));
  const destacado = body.destacado === true || body.destacado === "true";
  return { nombre, descripcion, precioBase, categoria, stock, destacado };
}

function mapProductoRow(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion || null,
    precioBase: Number(row.precio_base) || 0,
    categoria: row.categoria || null,
    stock: row.stock ?? null,
    destacado: row.destacado === true,
    imagenUrl: row.imagen_url || null,
    activo: row.activo !== false,
  };
}

app.get("/api/:slug/admin/productos", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.json([]);
    const { data, error } = await supabase.from("productos").select("*")
      .eq("business_id", req.business.id)
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingTableError(error)) return res.status(409).json({ error: MISSING_PRODUCTOS_TABLE_MSG });
      throw new Error(error.message);
    }
    res.json((data || []).map(mapProductoRow));
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/productos", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    const { nombre, descripcion, precioBase, categoria, stock, destacado } = parseProductoBody(req.body);
    if (!nombre || nombre.length < 2) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (!(precioBase > 0)) return res.status(400).json({ error: "El precio tiene que ser mayor a 0." });
    const imagenUrl = (req.body?.imagenUrl || "").trim() || null;

    const { data, error } = await supabase.from("productos").insert({
      business_id: req.business.id,
      nombre,
      descripcion,
      precio_base: precioBase,
      categoria,
      stock,
      destacado,
      imagen_url: imagenUrl,
      activo: true,
    }).select().single();
    if (error) {
      if (isMissingTableError(error)) return res.status(409).json({ error: MISSING_PRODUCTOS_TABLE_MSG });
      throw new Error(error.message);
    }
    res.status(201).json(mapProductoRow(data));
  } catch (error) { next(error); }
});

app.put("/api/:slug/admin/productos/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    const { nombre, descripcion, precioBase, categoria, stock, destacado } = parseProductoBody(req.body);
    if (!nombre || nombre.length < 2) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (!(precioBase > 0)) return res.status(400).json({ error: "El precio tiene que ser mayor a 0." });

    const patch = {
      nombre, descripcion, precio_base: precioBase, categoria, stock, destacado,
    };
    if (typeof req.body?.activo === "boolean") patch.activo = req.body.activo;
    if (typeof req.body?.imagenUrl === "string" && req.body.imagenUrl.trim()) {
      patch.imagen_url = req.body.imagenUrl.trim();
    }

    const { error } = await supabase.from("productos").update(patch)
      .eq("id", req.params.id).eq("business_id", req.business.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.patch("/api/:slug/admin/productos/:id/foto", resolveBusiness, requireAdmin, logoUpload.single("foto"), async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    if (!req.file) return res.status(400).json({ error: "No se recibió imagen." });
    const validMagic = await validateFileMagicBytes(req.file);
    if (!validMagic) return res.status(400).json({ error: "Imagen inválida. Solo JPG, PNG, WEBP." });

    const { data: prod } = await supabase.from("productos").select("id")
      .eq("id", req.params.id).eq("business_id", req.business.id).maybeSingle();
    if (!prod) return res.status(404).json({ error: "Producto no encontrado." });

    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const storagePath = `productos/prod_${req.business.id}_${req.params.id}_${Date.now()}${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(SUPABASE_BUCKET).upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);
    const imagenUrl = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath).data.publicUrl;

    const { error } = await supabase.from("productos").update({ imagen_url: imagenUrl })
      .eq("id", req.params.id).eq("business_id", req.business.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, imagenUrl });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/productos/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    const { error } = await supabase.from("productos").delete()
      .eq("id", req.params.id).eq("business_id", req.business.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ============================================================
// ADMIN: CONTENIDO (videos institucionales + galería "pieles reales")
// ============================================================
const MISSING_CONTENIDO_TABLE_MSG =
  "Todavía no corriste la migración de contenido en Supabase. Pedile a soporte el SQL de videos_landing / galeria_pieles.";

app.get("/api/:slug/admin/videos", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.json([]);
    const { data, error } = await supabase.from("videos_landing").select("*")
      .eq("business_id", req.business.id)
      .order("orden", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return res.status(409).json({ error: MISSING_CONTENIDO_TABLE_MSG });
      throw new Error(error.message);
    }
    res.json((data || []).map(mapVideoRow));
  } catch (error) { next(error); }
});

// Genera una URL firmada para que el navegador suba el video DIRECTO a
// Supabase Storage, sin pasar por esta función serverless (Vercel corta
// el body de las requests en ~4.5MB, un video no entra ahí).
const VIDEO_MIME_EXT = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-m4v": ".m4v",
};
app.post("/api/:slug/admin/videos/upload-url", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    const { count: videoCount } = await supabase.from("videos_landing")
      .select("id", { count: "exact", head: true }).eq("business_id", req.business.id);
    if ((videoCount || 0) >= MAX_VIDEOS_LANDING) {
      return res.status(400).json({ error: `Ya llegaste al máximo de ${MAX_VIDEOS_LANDING} videos. Eliminá uno para agregar otro.` });
    }
    const mimetype = String(req.body?.mimetype || "");
    const ext = VIDEO_MIME_EXT[mimetype];
    if (!ext) return res.status(400).json({ error: "Formato de video no soportado. Usá MP4, WEBM o MOV." });

    const filename = `video_${req.business.id}_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    const storagePath = `videos/${filename}`;
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUploadUrl(storagePath);
    if (error) throw new Error(error.message);

    const publicUrl = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    res.json({ signedUrl: data.signedUrl, token: data.token, path: storagePath, publicUrl });
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/videos", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    const titulo = (req.body?.titulo || "").trim().slice(0, 120) || null;
    const url = (req.body?.url || "").trim();
    const orden = Number.isFinite(Number(req.body?.orden)) ? Number(req.body.orden) : 0;
    if (!url) return res.status(400).json({ error: "El link del video es obligatorio." });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "El link tiene que empezar con http:// o https://" });

    const { count: videoCount, error: countError } = await supabase.from("videos_landing")
      .select("id", { count: "exact", head: true }).eq("business_id", req.business.id);
    if (countError) {
      if (isMissingTableError(countError)) return res.status(409).json({ error: MISSING_CONTENIDO_TABLE_MSG });
      throw new Error(countError.message);
    }
    if ((videoCount || 0) >= MAX_VIDEOS_LANDING) {
      return res.status(400).json({ error: `Ya llegaste al máximo de ${MAX_VIDEOS_LANDING} videos. Eliminá uno para agregar otro.` });
    }

    await resolverColisionOrdenVideo(req.business.id, null, orden, null);
    const { data, error } = await supabase.from("videos_landing").insert({
      business_id: req.business.id, titulo, url, seccion: "videos", orden, activo: true,
    }).select().single();
    if (error) {
      if (isMissingTableError(error)) return res.status(409).json({ error: MISSING_CONTENIDO_TABLE_MSG });
      throw new Error(error.message);
    }
    res.status(201).json(mapVideoRow(data));
  } catch (error) { next(error); }
});

app.put("/api/:slug/admin/videos/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    const patch = {};
    if (typeof req.body?.titulo === "string") patch.titulo = req.body.titulo.trim().slice(0, 120) || null;
    if (typeof req.body?.url === "string") {
      const url = req.body.url.trim();
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "El link tiene que empezar con http:// o https://" });
      patch.url = url;
    }
    if (Number.isFinite(Number(req.body?.orden))) patch.orden = Number(req.body.orden);
    if (typeof req.body?.activo === "boolean") patch.activo = req.body.activo;

    if (patch.orden != null) {
      const { data: actual } = await supabase.from("videos_landing").select("orden")
        .eq("id", req.params.id).eq("business_id", req.business.id).maybeSingle();
      if (actual && actual.orden !== patch.orden) {
        await resolverColisionOrdenVideo(req.business.id, req.params.id, patch.orden, actual.orden);
      }
    }

    const { error } = await supabase.from("videos_landing").update(patch)
      .eq("id", req.params.id).eq("business_id", req.business.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/videos/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    const { error } = await supabase.from("videos_landing").delete()
      .eq("id", req.params.id).eq("business_id", req.business.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/:slug/admin/galeria", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.json([]);
    const { data, error } = await supabase.from("galeria_pieles").select("*")
      .eq("business_id", req.business.id)
      .order("orden", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return res.status(409).json({ error: MISSING_CONTENIDO_TABLE_MSG });
      throw new Error(error.message);
    }
    res.json((data || []).map(mapGaleriaRow));
  } catch (error) { next(error); }
});

app.post(
  "/api/:slug/admin/galeria",
  resolveBusiness,
  requireAdmin,
  logoUpload.single("foto"),
  async (req, res, next) => {
    try {
      if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
      if (!req.file) return res.status(400).json({ error: "Subí una imagen." });
      const validMagic = await validateFileMagicBytes(req.file);
      if (!validMagic) return res.status(400).json({ error: "La imagen no es válida. Solo JPG, PNG o WEBP." });

      const { count: fotoCount, error: countError } = await supabase.from("galeria_pieles")
        .select("id", { count: "exact", head: true }).eq("business_id", req.business.id);
      if (countError) {
        if (isMissingTableError(countError)) return res.status(409).json({ error: MISSING_CONTENIDO_TABLE_MSG });
        throw new Error(countError.message);
      }
      if ((fotoCount || 0) >= MAX_GALERIA_FOTOS) {
        return res.status(400).json({ error: `Ya llegaste al máximo de ${MAX_GALERIA_FOTOS} fotos. Eliminá una para subir otra.` });
      }

      const titulo = (req.body?.titulo || "").trim().slice(0, 120) || null;
      const orden = Number.isFinite(Number(req.body?.orden)) ? Number(req.body.orden) : 0;

      const { data: inserted, error: insertError } = await supabase.from("galeria_pieles").insert({
        business_id: req.business.id, titulo, imagen_url: "", orden, activo: true,
      }).select().single();
      if (insertError) {
        if (isMissingTableError(insertError)) return res.status(409).json({ error: MISSING_CONTENIDO_TABLE_MSG });
        throw new Error(insertError.message);
      }

      const imagenUrl = await uploadGaleriaFotoFile(req.business.id, inserted.id, req.file);
      const { error: updateError } = await supabase.from("galeria_pieles")
        .update({ imagen_url: imagenUrl }).eq("id", inserted.id);
      if (updateError) throw new Error(updateError.message);

      res.status(201).json({ ...mapGaleriaRow(inserted), imagenUrl });
    } catch (error) { next(error); }
  }
);

app.patch("/api/:slug/admin/galeria/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    const patch = {};
    if (typeof req.body?.activo === "boolean") patch.activo = req.body.activo;
    if (Number.isFinite(Number(req.body?.orden))) patch.orden = Number(req.body.orden);
    if (typeof req.body?.titulo === "string") patch.titulo = req.body.titulo.trim().slice(0, 120) || null;
    const { error } = await supabase.from("galeria_pieles").update(patch)
      .eq("id", req.params.id).eq("business_id", req.business.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/galeria/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    if (!USE_SUPABASE) return res.status(501).json({ error: "No disponible en este entorno." });
    const { data: row } = await supabase.from("galeria_pieles").select("imagen_url")
      .eq("id", req.params.id).eq("business_id", req.business.id).maybeSingle();
    const { error } = await supabase.from("galeria_pieles").delete()
      .eq("id", req.params.id).eq("business_id", req.business.id);
    if (error) throw new Error(error.message);
    await removeGaleriaFotoFile(row?.imagen_url);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ============================================================
// ADMIN: MOVIMIENTOS (caja / ingresos / gastos)
// ============================================================
const MOVIMIENTO_TIPOS = new Set(["ingreso", "gasto"]);

app.get("/api/:slug/admin/movimientos", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const sync = await syncTurnoMovimientosForBusiness(req.business);
    let items;
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("movimientos").select("*")
        .eq("business_id", req.business.id)
        .order("fecha", { ascending: false })
        .order("id", { ascending: false });
      if (error) throw new Error(error.message);
      items = (data || []).map(mapMovimientoRow);
    } else {
      const rows = await dbAll(
        "SELECT * FROM movimientos WHERE business_id = ? ORDER BY fecha DESC, id DESC",
        [req.business.id]
      );
      items = rows.map(mapMovimientoRow);
    }
    return res.json({ items, sync });
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/movimientos", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const tipo = String(req.body?.tipo || "").trim().toLowerCase();
    const descripcion = String(req.body?.descripcion || "").trim();
    const categoria = String(req.body?.categoria || "Otros").trim() || "Otros";
    const monto = Number(String(req.body?.monto ?? "0").replace(",", "."));
    const fecha = String(req.body?.fecha || "").trim() || new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    if (!MOVIMIENTO_TIPOS.has(tipo)) return res.status(400).json({ error: "Tipo inválido. Usá ingreso o gasto." });
    if (!descripcion || descripcion.length < 2) return res.status(400).json({ error: "La descripción es obligatoria." });
    if (descripcion.length > 200) return res.status(400).json({ error: "Descripción demasiado larga." });
    if (categoria.length > 80) return res.status(400).json({ error: "Categoría inválida." });
    if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha inválida." });

    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("movimientos").insert({
        business_id: req.business.id, tipo, descripcion, categoria, monto, fecha, creado_en: now,
      }).select().single();
      if (error) {
        const msg = error.message || "";
        if (/row-level security/i.test(msg)) {
          throw new Error(
            "Supabase bloquea movimientos (RLS). Ejecutá en SQL: alter table movimientos disable row level security;"
          );
        }
        throw new Error(msg);
      }
      return res.status(201).json(mapMovimientoRow(data));
    }
    const result = await dbRun(
      `INSERT INTO movimientos (business_id, tipo, descripcion, categoria, monto, fecha, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.business.id, tipo, descripcion, categoria, monto, fecha, now]
    );
    return res.status(201).json({
      id: result.lastID, businessId: req.business.id, tipo, descripcion, categoria, monto, fecha,
      appointmentId: null, creadoEn: now,
    });
  } catch (error) { next(error); }
});

app.put("/api/:slug/admin/movimientos/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tipo = String(req.body?.tipo || "").trim().toLowerCase();
    const descripcion = String(req.body?.descripcion || "").trim();
    const categoria = String(req.body?.categoria || "Otros").trim() || "Otros";
    const monto = Number(String(req.body?.monto ?? "0").replace(",", "."));
    const fecha = String(req.body?.fecha || "").trim();

    if (!MOVIMIENTO_TIPOS.has(tipo)) return res.status(400).json({ error: "Tipo inválido. Usá ingreso o gasto." });
    if (!descripcion || descripcion.length < 2) return res.status(400).json({ error: "La descripción es obligatoria." });
    if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha inválida." });

    if (USE_SUPABASE) {
      const { error } = await supabase.from("movimientos").update({
        tipo, descripcion, categoria, monto, fecha,
      }).eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    const existing = await dbGet(
      "SELECT id FROM movimientos WHERE id = ? AND business_id = ? LIMIT 1",
      [id, req.business.id]
    );
    if (!existing) return res.status(404).json({ error: "Movimiento no encontrado." });
    await dbRun(
      `UPDATE movimientos SET tipo=?, descripcion=?, categoria=?, monto=?, fecha=?
       WHERE id=? AND business_id=?`,
      [tipo, descripcion, categoria, monto, fecha, id, req.business.id]
    );
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/movimientos/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (USE_SUPABASE) {
      const { error } = await supabase.from("movimientos").delete()
        .eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    await dbRun("DELETE FROM movimientos WHERE id = ? AND business_id = ?", [id, req.business.id]);
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

// ============================================================
// ADMIN: BUSINESS CONFIG + PASSWORD
// ============================================================
app.patch("/api/:slug/admin/business", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const nombre = (body.nombre || "").trim();
    const whatsapp = (body.whatsapp || "").replace(/\D/g, "");
    const transferAlias = (body.transferAlias || "").trim();
    const transferCbu = (body.transferCbu || "").trim();
    const transferTitular = (body.transferTitular || "").trim();
    const horaInicio = scheduleValueToMinutes(body.horaInicio);
    const horaFin = scheduleValueToMinutes(body.horaFin);
    const rawInicio2 = body.horaInicio2;
    const rawFin2 = body.horaFin2;
    const hasFranja2 = rawInicio2 !== "" && rawInicio2 != null && rawFin2 !== "" && rawFin2 != null;
    const horaInicio2 = hasFranja2 ? scheduleValueToMinutes(rawInicio2) : null;
    const horaFin2 = hasFranja2 ? scheduleValueToMinutes(rawFin2) : null;
    const diasAtencion = parseDiasAtencion(body.diasAtencion ?? body.dias_atencion);
    const diasAtencionStr = serializeDiasAtencion(diasAtencion);
    const precio = body.precio !== undefined && body.precio !== null
      ? String(body.precio).trim() || "0"
      : (req.business.precio || "0");
    const ciudad = (body.ciudad || "").trim() || req.business.ciudad || DEFAULT_BUSINESS_CIUDAD;
    const barrio = (body.barrio || "").trim() || null;
    const direccion = (body.direccion || "").trim() || null;
    if (!direccion) return res.status(400).json({ error: "La dirección es obligatoria." });
    if (direccion.length > 200) return res.status(400).json({ error: "La dirección es demasiado larga." });
    const colorMarca = (body.colorMarca || body.color_marca || "").trim() || null;
    let categoria = (body.categoria || "").trim();
    if (categoria && !CATEGORIAS.has(categoria)) {
      return res.status(400).json({ error: "Categoría inválida." });
    }
    if (!categoria) categoria = req.business.categoria;

    if (!nombre) return res.status(400).json({ error: "El nombre del negocio es obligatorio." });
    if (!diasAtencion.length) {
      return res.status(400).json({ error: "Seleccioná al menos un día de atención." });
    }
    if (!Number.isFinite(horaInicio) || !Number.isFinite(horaFin) || horaInicio >= horaFin) {
      return res.status(400).json({ error: "Franja 1 inválida: la hora de inicio debe ser menor a la de fin." });
    }
    if (horaInicio < 0 || horaFin > 24 * 60) {
      return res.status(400).json({ error: "Franja 1 fuera de rango (00:00–24:00)." });
    }
    if (hasFranja2) {
      if (!Number.isFinite(horaInicio2) || !Number.isFinite(horaFin2) || horaInicio2 >= horaFin2) {
        return res.status(400).json({ error: "Franja 2 inválida: la hora de inicio debe ser menor a la de fin." });
      }
      if (horaInicio2 < 0 || horaFin2 > 24 * 60) {
        return res.status(400).json({ error: "Franja 2 fuera de rango (00:00–24:00)." });
      }
      if (horaInicio2 < horaFin) {
        return res.status(400).json({ error: "La franja 2 debe empezar después de que termine la franja 1." });
      }
    }

    if (USE_SUPABASE) {
      const { error } = await supabase.from("businesses").update({
        nombre, whatsapp, transfer_alias: transferAlias, transfer_cbu: transferCbu,
        transfer_titular: transferTitular, hora_inicio: horaInicio, hora_fin: horaFin,
        hora_inicio_2: horaInicio2, hora_fin_2: horaFin2, dias_atencion: diasAtencionStr, precio,
        ciudad, barrio, direccion, color_marca: colorMarca, categoria,
      }).eq("id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    await dbRun(
      `UPDATE businesses SET nombre=?, whatsapp=?, transfer_alias=?, transfer_cbu=?, transfer_titular=?,
       hora_inicio=?, hora_fin=?, hora_inicio_2=?, hora_fin_2=?, dias_atencion=?, precio=?, ciudad=?, barrio=?, direccion=?, color_marca=?, categoria=? WHERE id=?`,
      [
        nombre, whatsapp, transferAlias, transferCbu, transferTitular,
        horaInicio, horaFin, horaInicio2, horaFin2, diasAtencionStr, precio, ciudad, barrio, direccion, colorMarca, categoria, req.business.id,
      ]
    );
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

// Alias legacy
app.patch("/api/:slug/admin/club", resolveBusiness, requireAdmin, (req, res, next) => {
  req.url = req.url.replace("/admin/club", "/admin/business");
  return app._router.handle(req, res, next);
});

app.patch("/api/:slug/admin/logo", resolveBusiness, requireAdmin, logoUpload.single("logo"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió imagen." });
    const validMagic = await validateFileMagicBytes(req.file);
    if (!validMagic) return res.status(400).json({ error: "Imagen inválida." });

    const logoUrl = await uploadBusinessLogoFile(req.business.id, req.file);
    req.business.logoUrl = logoUrl;
    return res.json({ ok: true, logoUrl });
  } catch (error) { next(error); }
});

app.patch("/api/:slug/admin/about-image", resolveBusiness, requireAdmin, logoUpload.single("foto"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió imagen." });
    const validMagic = await validateFileMagicBytes(req.file);
    if (!validMagic) return res.status(400).json({ error: "Imagen inválida." });

    const aboutImageUrl = await uploadBusinessAboutImageFile(req.business.id, req.file);
    req.business.aboutImageUrl = aboutImageUrl;
    return res.json({ ok: true, aboutImageUrl });
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/password", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const passwordActual = (req.body?.passwordActual || "").trim();
    const passwordNuevo = (req.body?.passwordNuevo || "").trim();
    if (!passwordActual || !passwordNuevo) {
      return res.status(400).json({ error: "Ambas contraseñas son requeridas." });
    }
    if (passwordNuevo.length < 6) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres." });
    }
    const ok = await verifyAdminPasswordForBusiness(passwordActual, req.business.id);
    if (!ok) return res.status(401).json({ error: "La contraseña actual es incorrecta." });

    await setBusinessAdminPassword(req.business.id, passwordNuevo);
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

async function setBusinessAdminPassword(businessId, password) {
  const { salt, hash } = hashAdminPassword(password);
  const now = new Date().toISOString();
  if (USE_SUPABASE) {
    const { data: existing } = await supabase
      .from("business_admins")
      .select("id")
      .eq("business_id", businessId)
      .maybeSingle();
    const payload = {
      password_salt: salt,
      password_hash: hash,
      password_salt_b: null,
      password_hash_b: null,
      actualizado_en: now,
    };
    if (existing) {
      const { error } = await supabase.from("business_admins").update(payload).eq("business_id", businessId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("business_admins").insert({
        business_id: businessId,
        ...payload,
      });
      if (error) throw new Error(error.message);
    }
    return;
  }
  const existing = await dbGet(
    "SELECT id FROM business_admins WHERE business_id = ? LIMIT 1",
    [businessId]
  );
  if (existing) {
    await dbRun(
      `UPDATE business_admins SET password_salt=?, password_hash=?, password_salt_b=NULL, password_hash_b=NULL, actualizado_en=?
       WHERE business_id=?`,
      [salt, hash, now, businessId]
    );
  } else {
    await dbRun(
      "INSERT INTO business_admins (business_id, password_salt, password_hash, actualizado_en) VALUES (?, ?, ?, ?)",
      [businessId, salt, hash, now]
    );
  }
}

// ============================================================
// PAGES — Canito Skin (negocio único)
// ============================================================
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "index.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "admin.html"));
});

app.get("/cart", (_req, res) => {
  const cartPage = path.join(ROOT_DIR, "public", "cart.html");
  if (fsSync.existsSync(cartPage)) {
    return res.sendFile(cartPage);
  }
  return res.redirect("/");
});

// Cron diario (ver vercel.json): borra los comprobantes de turnos con
// más de 7 días de antigüedad (fecha del turno, no de carga). El turno
// en sí queda en el historial — solo se limpia el archivo y su referencia,
// para no acumular fotos/PDF de pago vencidos en el storage.
app.get("/api/cron/limpiar-comprobantes", async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || "";
    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "No autorizado." });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    let limpiados = 0;
    if (USE_SUPABASE) {
      const { data: appts, error } = await supabase.from("appointments")
        .select("id, comprobante_archivo")
        .lt("fecha", cutoffStr)
        .not("comprobante_archivo", "is", null);
      if (error) throw new Error(error.message);
      for (const appt of appts || []) {
        if (appt.comprobante_archivo) {
          await supabase.storage.from(SUPABASE_BUCKET).remove([appt.comprobante_archivo]).catch(() => {});
        }
        await supabase.from("appointments").update({
          comprobante_archivo: null,
          comprobante_nombre_original: null,
          comprobante_mimetype: null,
          comprobante_size: null,
        }).eq("id", appt.id);
        limpiados++;
      }
    } else {
      const rows = await dbAll(
        "SELECT id, comprobante_archivo FROM appointments WHERE fecha < ? AND comprobante_archivo IS NOT NULL",
        [cutoffStr]
      );
      for (const row of rows) {
        if (row.comprobante_archivo) {
          await fs.unlink(path.join(UPLOADS_DIR, row.comprobante_archivo)).catch(() => {});
        }
        await dbRun(
          `UPDATE appointments SET comprobante_archivo = NULL, comprobante_nombre_original = NULL,
             comprobante_mimetype = NULL, comprobante_size = NULL WHERE id = ?`,
          [row.id]
        );
        limpiados++;
      }
    }
    res.json({ ok: true, limpiados, antesDe: cutoffStr });
  } catch (error) { next(error); }
});

app.get("/market", (_req, res) => {
  const marketPage = path.join(ROOT_DIR, "public", "market.html");
  if (fsSync.existsSync(marketPage)) {
    return res.sendFile(marketPage);
  }
  return res.redirect("/");
});

app.get("/privacidad", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "privacidad.html"));
});

app.get("/terminos", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "terminos.html"));
});

// Compat: alguien puede llegar con /canito o /canito/admin en el link.
app.get("/:slug", async (req, res, next) => {
  if (req.params.slug.includes(".")) return next();
  try {
    const business = await getBusinessBySlug(req.params.slug, { onlyActivo: true });
    if (!business) return next();
    res.sendFile(path.join(ROOT_DIR, "public", "index.html"));
  } catch (error) { next(error); }
});

app.get("/:slug/admin", async (req, res, next) => {
  if (req.params.slug.includes(".")) return next();
  try {
    const business = await getBusinessBySlug(req.params.slug, { onlyActivo: true });
    if (!business) return next();
    res.sendFile(path.join(ROOT_DIR, "public", "admin.html"));
  } catch (error) { next(error); }
});

// ============================================================
// ERROR HANDLER
// ============================================================
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "El archivo supera 5 MB. Subí uno más liviano." });
    }
    return res.status(400).json({ error: "Error al subir el archivo." });
  }
  if (err.message) return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: "Error interno del servidor." });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Canito Skin en http://localhost:${PORT}`));
}

module.exports = app;
