const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

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
const CATEGORIAS = new Set(["peluqueria", "estetica", "masajes", "psicologia", "legal", "otro"]);
const ESTADOS_NEGOCIO = new Set([
  "pendiente_pago", "pendiente_aprobacion", "activo", "pausado", "suspendido", "rechazado", "dado_de_baja",
]);
const ESTADOS_CON_MOTIVO = new Set(["pausado", "suspendido", "dado_de_baja"]);
const ESTADOS_TURNO = new Set(["pendiente", "confirmada", "cancelada"]);

const DEFAULT_BUSINESS_SLUG = (process.env.BUSINESS_SLUG || "mi-negocio").toLowerCase().replace(/[^a-z0-9-]/g, "-");
const DEFAULT_BUSINESS_NOMBRE = process.env.BUSINESS_NOMBRE || "Studio Demo CMR";
const DEFAULT_BUSINESS_CATEGORIA = CATEGORIAS.has(process.env.BUSINESS_CATEGORIA)
  ? process.env.BUSINESS_CATEGORIA
  : "peluqueria";
const DEFAULT_BUSINESS_CIUDAD = process.env.BUSINESS_CIUDAD || "San Nicolás";
const DEFAULT_BUSINESS_BARRIO = process.env.BUSINESS_BARRIO || "Centro";
const DEFAULT_BUSINESS_COLOR = process.env.BUSINESS_COLOR_MARCA || "#0f766e";
const DEFAULT_BUSINESS_HORA_INICIO = parseInt(process.env.BUSINESS_HORA_INICIO || "9", 10);
const DEFAULT_BUSINESS_HORA_FIN = parseInt(process.env.BUSINESS_HORA_FIN || "20", 10);
const DEFAULT_BUSINESS_PRECIO = process.env.BUSINESS_PRECIO || "0";
const DEFAULT_BUSINESS_WHATSAPP = (process.env.WHATSAPP_NUMERO || "5491112345678").replace(/\D/g, "");
const DEFAULT_BUSINESS_ALIAS = process.env.TRANSFER_ALIAS || "mi.alias";
const DEFAULT_BUSINESS_CBU = process.env.TRANSFER_CBU || "0000000000000000000000";
const DEFAULT_BUSINESS_TITULAR = process.env.TRANSFER_TITULAR || "Nombre Negocio";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DEFAULT_ADMIN_PASSWORD_SECOND = process.env.ADMIN_PASSWORD_SECOND || "";
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "";

const LOGOS_DIR = path.join(UPLOADS_DIR, "logos");
const SOLICITUDES_DIR = path.join(UPLOADS_DIR, "solicitudes");
if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });
if (!fsSync.existsSync(UPLOADS_DIR)) fsSync.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fsSync.existsSync(LOGOS_DIR)) fsSync.mkdirSync(LOGOS_DIR, { recursive: true });
if (!fsSync.existsSync(SOLICITUDES_DIR)) fsSync.mkdirSync(SOLICITUDES_DIR, { recursive: true });

const SUBSCRIPTION_PRECIO = process.env.SUBSCRIPTION_PRECIO || "0";
const SUBSCRIPTION_ALIAS = process.env.SUBSCRIPTION_TRANSFER_ALIAS || "";
const SUBSCRIPTION_CBU = process.env.SUBSCRIPTION_TRANSFER_CBU || "";
const SUBSCRIPTION_TITULAR = process.env.SUBSCRIPTION_TRANSFER_TITULAR || "";

const PLANES_FALLBACK = {
  inicial:     { nombre: "Inicial",     limiteProfesionales: 1,    precio: 20000 },
  profesional: { nombre: "Profesional", limiteProfesionales: 3,    precio: 35000 },
  max:         { nombre: "Max",         limiteProfesionales: null, precio: 50000 },
};

let platformPlansCache = null;
let platformPlansCacheAt = 0;
const PLATFORM_PLANS_TTL_MS = 60 * 1000;

function mapPlanRow(r) {
  let raw = r.limite_profesionales !== undefined ? r.limite_profesionales : r.max_professionals;
  if (raw === -1) raw = null; // sentinel legacy "ilimitado"
  const limite = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  return {
    nombre: r.nombre,
    limiteProfesionales: Number.isFinite(limite) ? limite : null,
    maxProfessionals: Number.isFinite(limite) ? limite : null,
    precio: Number(r.precio),
  };
}

async function loadPlatformPlans() {
  const now = Date.now();
  if (platformPlansCache && now - platformPlansCacheAt < PLATFORM_PLANS_TTL_MS) {
    return platformPlansCache;
  }
  try {
    if (USE_SQLITE) {
      const rows = await dbAll("SELECT id, nombre, limite_profesionales, precio FROM platform_plans ORDER BY precio ASC");
      if (rows?.length) {
        const map = {};
        for (const r of rows) map[r.id] = mapPlanRow(r);
        platformPlansCache = map;
        platformPlansCacheAt = now;
        return map;
      }
    }
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from("platform_plans")
        .select("id, nombre, limite_profesionales, precio")
        .order("precio");
      if (!error && data?.length) {
        const map = {};
        for (const r of data) map[r.id] = mapPlanRow(r);
        platformPlansCache = map;
        platformPlansCacheAt = now;
        return map;
      }
    }
  } catch (err) {
    console.warn("[plans] fallback a constantes:", err.message);
  }
  platformPlansCache = { ...PLANES_FALLBACK };
  platformPlansCacheAt = now;
  return platformPlansCache;
}

async function getMaxProfessionals(planId) {
  const plans = await loadPlatformPlans();
  const limite = plans[planId]?.limiteProfesionales;
  if (limite == null) return Number.POSITIVE_INFINITY;
  return limite;
}

async function getPlanInfo(planId) {
  const plans = await loadPlatformPlans();
  return plans[planId] || PLANES_FALLBACK[planId] || PLANES_FALLBACK.inicial;
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

function verifySuperAdminPassword(plain) {
  if (!SUPERADMIN_PASSWORD || !plain) return false;
  return timingSafeEqualString(plain, SUPERADMIN_PASSWORD);
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
    CREATE TABLE IF NOT EXISTS platform_plans (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      limite_profesionales INTEGER,
      max_professionals INTEGER,
      precio REAL NOT NULL DEFAULT 0
    )
  `);
  try {
    const cols = await dbAll("PRAGMA table_info(platform_plans)");
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("limite_profesionales")) {
      await dbRun("ALTER TABLE platform_plans ADD COLUMN limite_profesionales INTEGER");
      await dbRun("UPDATE platform_plans SET limite_profesionales = max_professionals WHERE limite_profesionales IS NULL");
    }
  } catch (_) { /* ignore */ }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'otro',
      ciudad TEXT,
      barrio TEXT,
      color_marca TEXT DEFAULT '#0f766e',
      logo_url TEXT,
      whatsapp TEXT NOT NULL DEFAULT '',
      transfer_alias TEXT NOT NULL DEFAULT '',
      transfer_cbu TEXT NOT NULL DEFAULT '',
      transfer_titular TEXT NOT NULL DEFAULT '',
      hora_inicio INTEGER NOT NULL DEFAULT 9,
      hora_fin INTEGER NOT NULL DEFAULT 20,
      precio TEXT NOT NULL DEFAULT '0',
      plan TEXT NOT NULL DEFAULT 'inicial',
      estado TEXT NOT NULL DEFAULT 'activo',
      estado_motivo TEXT,
      creado_en TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS professionals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      duracion_min INTEGER NOT NULL DEFAULT 30,
      precio TEXT NOT NULL DEFAULT '0',
      categoria TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      professional_id INTEGER,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    )
  `);

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
    CREATE TABLE IF NOT EXISTS business_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt_b TEXT,
      password_hash_b TEXT,
      actualizado_en TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'super_admin',
      creado_en TEXT NOT NULL
    )
  `);

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

  await dbRun(`
    CREATE TABLE IF NOT EXISTS platform_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      plan_id TEXT NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      comprobante_url TEXT,
      creado_en TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS solicitudes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      slug TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'otro',
      ciudad TEXT,
      barrio TEXT,
      whatsapp TEXT NOT NULL,
      email TEXT NOT NULL,
      comprobante_url TEXT,
      plan TEXT NOT NULL DEFAULT 'inicial',
      estado TEXT NOT NULL DEFAULT 'pendiente',
      creado_en TEXT NOT NULL
    )
  `);

  await dbRun("CREATE INDEX IF NOT EXISTS idx_appointments_biz_fecha ON appointments (business_id, fecha)");
  await dbRun("CREATE INDEX IF NOT EXISTS idx_appointments_cancel ON appointments (cancel_token)");
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

async function verifySuperAdminFromDb(plain) {
  if (!plain) return false;
  if (USE_SQLITE) {
    const rows = await dbAll("SELECT * FROM admin_users WHERE role = 'super_admin'");
    return rows.some((row) => verifyAdminPasswordScrypt(plain, row.password_salt, row.password_hash));
  }
  if (USE_SUPABASE) {
    const { data } = await supabase.from("admin_users").select("*").eq("role", "super_admin");
    return (data || []).some((row) => verifyAdminPasswordScrypt(plain, row.password_salt, row.password_hash));
  }
  return false;
}

async function isValidSuperAdminPassword(plain) {
  if (verifySuperAdminPassword(plain)) return true;
  return verifySuperAdminFromDb(plain);
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

function requireSuperAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" ");
  const parsed = parseAdminToken(token);
  if (!parsed || parsed.businessId !== 0) {
    return res.status(401).json({ error: "No autorizado." });
  }
  return next();
}

// ============================================================
// TIME / AVAILABILITY ENGINE
// ============================================================
function timeToMinutes(hhmm) {
  if (!hhmm) return null;
  const parts = String(hhmm).split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] || 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

function getBloqueoRangeMinutes(bloqueo, business) {
  const openStart = Number(business.horaInicio) * 60;
  const openEnd = Number(business.horaFin) * 60;
  if (bloqueo.diaCompleto) return { desde: openStart, hasta: openEnd };
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
  if (professionalId == null) {
    return appt.professionalId == null;
  }
  return appt.professionalId != null && Number(appt.professionalId) === Number(professionalId);
}

/**
 * Genera slots HH:MM cada SLOT_STEP_MIN donde cabe un servicio de duracionMin.
 * Los turnos deben terminar a más tardar en hora_fin (cierre).
 */
function generateAvailableSlots(duracionMin, appointments, bloqueos, professionalId, business) {
  const duration = Number(duracionMin);
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const openStart = Number(business.horaInicio) * 60;
  const openEnd = Number(business.horaFin) * 60;
  if (!Number.isFinite(openStart) || !Number.isFinite(openEnd) || openStart >= openEnd) return [];

  const slots = [];
  for (let start = openStart; start + duration <= openEnd; start += SLOT_STEP_MIN) {
    const end = start + duration;

    const conflictAppt = (appointments || []).some((a) => {
      if (!appointmentConflictsForProfessional(a, professionalId)) return false;
      const aStart = timeToMinutes(a.horaInicio);
      const aEnd = timeToMinutes(a.horaFin);
      if (aStart == null || aEnd == null) return false;
      return rangesOverlap(start, end, aStart, aEnd);
    });
    if (conflictAppt) continue;

    const conflictBloqueo = (bloqueos || []).some((b) => {
      if (!bloqueoAppliesToProfessional(b, professionalId)) return false;
      const range = getBloqueoRangeMinutes(b, business);
      if (range.desde == null || range.hasta == null) return false;
      return rangesOverlap(start, end, range.desde, range.hasta);
    });
    if (conflictBloqueo) continue;

    slots.push(minutesToTime(start));
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

// ============================================================
// MAPPERS
// ============================================================
function mapBusinessRow(row, professionals = [], services = [], clientPlans = []) {
  const plan = row.plan || "inicial";
  const pros = (professionals || []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    activo: Boolean(p.activo ?? p.activa ?? true),
  }));
  return {
    id: row.id,
    slug: row.slug,
    nombre: row.nombre,
    categoria: row.categoria || "otro",
    ciudad: row.ciudad || null,
    barrio: row.barrio || null,
    colorMarca: row.color_marca || "#0f766e",
    logoUrl: row.logo_url || null,
    whatsapp: row.whatsapp || "",
    transferencia: {
      alias: row.transfer_alias || "",
      cbu: row.transfer_cbu || "",
      titular: row.transfer_titular || "",
    },
    horaInicio: Number(row.hora_inicio),
    horaFin: Number(row.hora_fin),
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
    categoria: row.categoria || null,
    activo: Boolean(row.activo),
    professionalId: row.professional_id ?? null,
  };
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
  return {
    id: row.id,
    businessId: row.business_id,
    nombre: row.nombre,
    activo: Boolean(row.activo),
  };
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
    mapped.maxProfessionals = await getMaxProfessionals(mapped.plan);
    return mapped;
  }
  return null;
}

async function listPublicBusinesses() {
  if (USE_SQLITE) {
    const rows = await dbAll(
      `SELECT slug, nombre, logo_url, categoria, ciudad, barrio, color_marca
       FROM businesses WHERE estado = 'activo' ORDER BY id ASC`
    );
    return rows.map((r) => ({
      slug: r.slug,
      nombre: r.nombre,
      logoUrl: r.logo_url || null,
      categoria: r.categoria || "otro",
      ciudad: r.ciudad || null,
      barrio: r.barrio || null,
      colorMarca: r.color_marca || null,
    }));
  }
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from("businesses")
      .select("slug, nombre, logo_url, categoria, ciudad, barrio, color_marca")
      .eq("estado", "activo")
      .order("id");
    if (error) throw new Error(error.message);
    return (data || []).map((r) => ({
      slug: r.slug,
      nombre: r.nombre,
      logoUrl: r.logo_url || null,
      categoria: r.categoria || "otro",
      ciudad: r.ciudad || null,
      barrio: r.barrio || null,
      colorMarca: r.color_marca || null,
    }));
  }
  return [];
}

// ============================================================
// SEED
// ============================================================
async function ensureAdminForBusiness(businessId, now) {
  if (USE_SQLITE) {
    const existing = await dbGet("SELECT id FROM business_admins WHERE business_id = ? LIMIT 1", [businessId]);
    const h1 = hashAdminPassword(DEFAULT_ADMIN_PASSWORD);
    const h2 = DEFAULT_ADMIN_PASSWORD_SECOND ? hashAdminPassword(DEFAULT_ADMIN_PASSWORD_SECOND) : null;
    if (existing) {
      await dbRun(
        `UPDATE business_admins SET password_salt=?, password_hash=?, password_salt_b=?, password_hash_b=?, actualizado_en=?
         WHERE business_id=?`,
        [h1.salt, h1.hash, h2 ? h2.salt : null, h2 ? h2.hash : null, now, businessId]
      );
      return;
    }
    await dbRun(
      `INSERT INTO business_admins (business_id, password_salt, password_hash, password_salt_b, password_hash_b, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [businessId, h1.salt, h1.hash, h2 ? h2.salt : null, h2 ? h2.hash : null, now]
    );
    return;
  }
  if (USE_SUPABASE) {
    const { data: existing } = await supabase
      .from("business_admins").select("id").eq("business_id", businessId).maybeSingle();
    if (existing) return;
    const h1 = hashAdminPassword(DEFAULT_ADMIN_PASSWORD);
    const h2 = DEFAULT_ADMIN_PASSWORD_SECOND ? hashAdminPassword(DEFAULT_ADMIN_PASSWORD_SECOND) : null;
    const { error } = await supabase.from("business_admins").insert({
      business_id: businessId,
      password_salt: h1.salt,
      password_hash: h1.hash,
      password_salt_b: h2 ? h2.salt : null,
      password_hash_b: h2 ? h2.hash : null,
      actualizado_en: now,
    });
    if (error) console.warn("[seed] No se pudo crear business_admin:", error.message);
  }
}

async function seedPlatformPlans() {
  const rows = [
    { id: "inicial", nombre: "Inicial", limite_profesionales: 1, precio: 20000 },
    { id: "profesional", nombre: "Profesional", limite_profesionales: 3, precio: 35000 },
    { id: "max", nombre: "Max", limite_profesionales: null, precio: 50000 },
  ];
  if (USE_SQLITE) {
    for (const p of rows) {
      // max_professionals legado: si limite es null, guardamos NULL si la columna lo permite;
      // si falla NOT NULL, usamos -1 como sentinel de "ilimitado".
      const legacyMax = p.limite_profesionales == null ? -1 : p.limite_profesionales;
      await dbRun(
        `INSERT INTO platform_plans (id, nombre, limite_profesionales, max_professionals, precio)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           nombre = excluded.nombre,
           limite_profesionales = excluded.limite_profesionales,
           max_professionals = excluded.max_professionals,
           precio = excluded.precio`,
        [p.id, p.nombre, p.limite_profesionales, legacyMax, p.precio]
      );
    }
    await dbRun("DELETE FROM platform_plans WHERE id = 'estandar'");
    platformPlansCache = null;
    return;
  }
  if (USE_SUPABASE) {
    for (const p of rows) {
      await supabase.from("platform_plans").upsert(
        {
          id: p.id,
          nombre: p.nombre,
          limite_profesionales: p.limite_profesionales,
          max_professionals: p.limite_profesionales,
          precio: p.precio,
        },
        { onConflict: "id" }
      );
    }
    await supabase.from("platform_plans").delete().eq("id", "estandar");
    platformPlansCache = null;
  }
}

async function seedDefaultBusiness() {
  const now = new Date().toISOString();
  await seedPlatformPlans();

  if (USE_SQLITE) {
    const existing = await dbGet("SELECT id FROM businesses WHERE slug = ? LIMIT 1", [DEFAULT_BUSINESS_SLUG]);
    if (existing) {
      await ensureAdminForBusiness(existing.id, now);
      return;
    }
    const result = await dbRun(
      `INSERT INTO businesses (
         slug, nombre, categoria, ciudad, barrio, color_marca, whatsapp,
         transfer_alias, transfer_cbu, transfer_titular,
         hora_inicio, hora_fin, precio, plan, estado, creado_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inicial', 'activo', ?)`,
      [
        DEFAULT_BUSINESS_SLUG, DEFAULT_BUSINESS_NOMBRE, DEFAULT_BUSINESS_CATEGORIA,
        DEFAULT_BUSINESS_CIUDAD, DEFAULT_BUSINESS_BARRIO, DEFAULT_BUSINESS_COLOR,
        DEFAULT_BUSINESS_WHATSAPP, DEFAULT_BUSINESS_ALIAS, DEFAULT_BUSINESS_CBU,
        DEFAULT_BUSINESS_TITULAR, DEFAULT_BUSINESS_HORA_INICIO, DEFAULT_BUSINESS_HORA_FIN,
        DEFAULT_BUSINESS_PRECIO, now,
      ]
    );
    const businessId = result.lastID;

    const ana = await dbRun(
      "INSERT INTO professionals (business_id, nombre, activo) VALUES (?, ?, 1)",
      [businessId, "Ana"]
    );
    const luis = await dbRun(
      "INSERT INTO professionals (business_id, nombre, activo) VALUES (?, ?, 1)",
      [businessId, "Luis"]
    );
    void ana; void luis;

    const seedServices = [
      { nombre: "Corte", descripcion: "Corte de cabello", duracion_min: 45, precio: "8000", categoria: "peluqueria" },
      { nombre: "Coloración", descripcion: "Coloración completa", duracion_min: 120, precio: "25000", categoria: "peluqueria" },
      { nombre: "Barba", descripcion: "Arreglo de barba", duracion_min: 30, precio: "5000", categoria: "peluqueria" },
    ];
    for (const s of seedServices) {
      await dbRun(
        `INSERT INTO services (business_id, nombre, descripcion, duracion_min, precio, categoria, activo)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [businessId, s.nombre, s.descripcion, s.duracion_min, s.precio, s.categoria]
      );
    }

    await dbRun(
      `INSERT INTO plans (business_id, nombre, sesiones, precio, descripcion, activo)
       VALUES (?, '4 cortes', 4, '28000', 'Pack de 4 cortes', 1)`,
      [businessId]
    );

    await ensureAdminForBusiness(businessId, now);
    console.log(`[seed] Negocio "${DEFAULT_BUSINESS_NOMBRE}" creado con slug "${DEFAULT_BUSINESS_SLUG}"`);
    return;
  }

  if (USE_SUPABASE) {
    const { data: existing } = await supabase
      .from("businesses").select("id").eq("slug", DEFAULT_BUSINESS_SLUG).maybeSingle();
    if (existing) {
      await ensureAdminForBusiness(existing.id, now);
      return;
    }
    const { data: biz, error } = await supabase.from("businesses").insert({
      slug: DEFAULT_BUSINESS_SLUG,
      nombre: DEFAULT_BUSINESS_NOMBRE,
      categoria: DEFAULT_BUSINESS_CATEGORIA,
      ciudad: DEFAULT_BUSINESS_CIUDAD,
      barrio: DEFAULT_BUSINESS_BARRIO,
      color_marca: DEFAULT_BUSINESS_COLOR,
      whatsapp: DEFAULT_BUSINESS_WHATSAPP,
      transfer_alias: DEFAULT_BUSINESS_ALIAS,
      transfer_cbu: DEFAULT_BUSINESS_CBU,
      transfer_titular: DEFAULT_BUSINESS_TITULAR,
      hora_inicio: DEFAULT_BUSINESS_HORA_INICIO,
      hora_fin: DEFAULT_BUSINESS_HORA_FIN,
      precio: DEFAULT_BUSINESS_PRECIO,
      plan: "inicial",
      estado: "activo",
      creado_en: now,
    }).select().single();
    if (error) { console.warn("[seed] No se pudo crear negocio en Supabase:", error.message); return; }
    const businessId = biz.id;

    await supabase.from("professionals").insert([
      { business_id: businessId, nombre: "Ana", activo: true },
      { business_id: businessId, nombre: "Luis", activo: true },
    ]);
    await supabase.from("services").insert([
      { business_id: businessId, nombre: "Corte", descripcion: "Corte de cabello", duracion_min: 45, precio: "8000", categoria: "peluqueria", activo: true },
      { business_id: businessId, nombre: "Coloración", descripcion: "Coloración completa", duracion_min: 120, precio: "25000", categoria: "peluqueria", activo: true },
      { business_id: businessId, nombre: "Barba", descripcion: "Arreglo de barba", duracion_min: 30, precio: "5000", categoria: "peluqueria", activo: true },
    ]);
    await supabase.from("plans").insert({
      business_id: businessId, nombre: "4 cortes", sesiones: 4, precio: "28000",
      descripcion: "Pack de 4 cortes", activo: true,
    });
    await ensureAdminForBusiness(businessId, now);
    console.log(`[seed] Negocio "${DEFAULT_BUSINESS_NOMBRE}" creado en Supabase con slug "${DEFAULT_BUSINESS_SLUG}"`);
  }
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

function resolveProfessionalForBooking(business, requestedProfessionalId) {
  const activePros = (business.professionals || []).filter((p) => p.activo);
  if (activePros.length === 0) {
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
    return { professionalId: null, error: "Profesional inválido." };
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
  limits: { fileSize: 2 * 1024 * 1024 },
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

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(ROOT_DIR, "public"), { index: false }));

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
async function handleListNegocios(_req, res, next) {
  try {
    res.json(await listPublicBusinesses());
  } catch (error) { next(error); }
}

app.get("/api/negocios", handleListNegocios);
app.get("/api/clubs", handleListNegocios);

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
      colorMarca: b.colorMarca,
      logoUrl: b.logoUrl,
      horaInicio: b.horaInicio,
      horaFin: b.horaFin,
      precio: b.precio,
      plan: b.plan,
      maxProfessionals: b.maxProfessionals,
      transferencia: b.transferencia,
      whatsappNumero: b.whatsapp,
      services: b.services,
      plans: b.plans,
      requiereProfesional: activePros.length > 1,
      professionals: activePros.length > 1
        ? activePros.map((p) => ({ id: p.id, nombre: p.nombre }))
        : activePros.length === 1
          ? [{ id: activePros[0].id, nombre: activePros[0].nombre }]
          : [],
      professionalsCount: activePros.length,
      slotStepMin: SLOT_STEP_MIN,
    });
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
      req.query.professionalId
    );
    if (proError) return res.status(400).json({ error: proError });

    const [appointments, bloqueos] = await Promise.all([
      readAppointments({ businessId: req.business.id, fecha }),
      readBloqueos({ businessId: req.business.id, fecha, professionalId: professionalId ?? undefined }),
    ]);

    const slots = generateAvailableSlots(
      service.duracion_min,
      appointments,
      bloqueos,
      professionalId,
      req.business
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
      req.body?.professionalId
    );
    if (proError) return res.status(400).json({ error: proError });

    const duracionMin = Number(service.duracion_min);
    const startMin = timeToMinutes(horaInicio);
    if (startMin == null) return res.status(400).json({ error: "Horario inválido." });
    const endMin = startMin + duracionMin;
    const openEnd = req.business.horaFin * 60;
    if (endMin > openEnd) {
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
        estado: "pendiente",
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
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?)`,
        [
          businessId, serviceId, professionalId, nombre, telefono, fecha,
          horaInicio, horaFin, duracionMin, cancelToken,
          req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, creadoEn,
        ]
      );
      appointmentId = insertResult.lastID;
    }

    const comprobanteUrl = comprobantePublicUrl(req, comprobanteArchivo);
    const serviceNombre = service.nombre;
    const proNombre = professionalId
      ? (req.business.professionals.find((p) => Number(p.id) === Number(professionalId))?.nombre || "")
      : "";
    const waText = [
      `Hola! Quiero confirmar mi turno en ${req.business.nombre}.`,
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
      estado: "pendiente",
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
    res.json(appointments.map((a) => ({
      ...a,
      comprobanteUrl: USE_SUPABASE
        ? supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(a.comprobante.archivo).data.publicUrl
        : `/uploads/${a.comprobante.archivo}`,
    })));
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/reservas/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const appointments = await readAppointments({ businessId: req.business.id, includeCanceladas: true });
    const eliminada = appointments.find((a) => Number(a.id) === id);
    if (!eliminada) return res.status(404).json({ error: "Turno no encontrado." });

    if (USE_SUPABASE) {
      if (eliminada.comprobante?.archivo) {
        await supabase.storage.from(SUPABASE_BUCKET).remove([eliminada.comprobante.archivo]);
      }
      const { error } = await supabase.from("appointments").delete().eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
    } else {
      await dbRun("DELETE FROM appointments WHERE id = ? AND business_id = ?", [id, req.business.id]);
      if (eliminada.comprobante?.archivo) {
        fs.unlink(path.join(UPLOADS_DIR, eliminada.comprobante.archivo)).catch(() => {});
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
      return res.json((data || []).map(mapProfessionalRow));
    }
    const rows = await dbAll(
      "SELECT * FROM professionals WHERE business_id = ? ORDER BY id ASC",
      [req.business.id]
    );
    return res.json(rows.map(mapProfessionalRow));
  } catch (error) { next(error); }
});

app.post("/api/:slug/admin/professionals", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const nombre = (req.body?.nombre || "").trim();
    if (!nombre) return res.status(400).json({ error: "El nombre del profesional es obligatorio." });

    const maxPros = await getMaxProfessionals(req.business.plan);
    const planInfo = await getPlanInfo(req.business.plan);

    if (USE_SUPABASE) {
      const { count } = await supabase.from("professionals").select("id", { count: "exact", head: true })
        .eq("business_id", req.business.id).eq("activo", true);
    if (Number.isFinite(maxPros) && (count || 0) >= maxPros) {
        return res.status(403).json({
          error: `Tu plan ${planInfo.nombre} permite hasta ${maxPros} profesional${maxPros === 1 ? "" : "es"}. Mejorá tu plan para agregar más.`,
        });
      }
      const { data, error } = await supabase.from("professionals")
        .insert({ business_id: req.business.id, nombre, activo: true }).select().single();
      if (error) throw new Error(error.message);
      return res.status(201).json(mapProfessionalRow(data));
    }
    const countRow = await dbGet(
      "SELECT COUNT(*) as cnt FROM professionals WHERE business_id = ? AND activo = 1",
      [req.business.id]
    );
    if (Number.isFinite(maxPros) && (countRow?.cnt || 0) >= maxPros) {
      return res.status(403).json({
        error: `Tu plan ${planInfo.nombre} permite hasta ${maxPros} profesional${maxPros === 1 ? "" : "es"}. Mejorá tu plan para agregar más.`,
      });
    }
    const result = await dbRun(
      "INSERT INTO professionals (business_id, nombre, activo) VALUES (?, ?, 1)",
      [req.business.id, nombre]
    );
    return res.status(201).json({ id: result.lastID, businessId: req.business.id, nombre, activo: true });
  } catch (error) { next(error); }
});

app.put("/api/:slug/admin/professionals/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const nombre = (req.body?.nombre || "").trim();
    const activo = req.body?.activo;
    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio." });

    if (USE_SUPABASE) {
      const patch = { nombre };
      if (typeof activo === "boolean") patch.activo = activo;
      const { error } = await supabase.from("professionals").update(patch)
        .eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    if (typeof activo === "boolean") {
      await dbRun(
        "UPDATE professionals SET nombre = ?, activo = ? WHERE id = ? AND business_id = ?",
        [nombre, activo ? 1 : 0, id, req.business.id]
      );
    } else {
      await dbRun(
        "UPDATE professionals SET nombre = ? WHERE id = ? AND business_id = ?",
        [nombre, id, req.business.id]
      );
    }
    return res.json({ ok: true });
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
    const categoria = (req.body?.categoria || "").trim() || null;
    const professionalId = req.body?.professionalId != null && req.body.professionalId !== ""
      ? Number(req.body.professionalId)
      : null;

    if (!nombre) return res.status(400).json({ error: "El nombre del servicio es obligatorio." });
    if (!Number.isFinite(duracionMin) || duracionMin < SLOT_STEP_MIN) {
      return res.status(400).json({ error: `La duración mínima es ${SLOT_STEP_MIN} minutos.` });
    }

    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("services").insert({
        business_id: req.business.id, nombre, descripcion, duracion_min: duracionMin,
        precio, categoria, professional_id: professionalId, activo: true,
      }).select().single();
      if (error) throw new Error(error.message);
      return res.status(201).json(mapServiceRow(data));
    }
    const result = await dbRun(
      `INSERT INTO services (business_id, nombre, descripcion, duracion_min, precio, categoria, professional_id, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [req.business.id, nombre, descripcion, duracionMin, precio, categoria, professionalId]
    );
    return res.status(201).json({
      id: result.lastID, businessId: req.business.id, nombre, descripcion,
      duracionMin, precio, categoria, professionalId, activo: true,
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
    const categoria = (req.body?.categoria || "").trim() || null;
    const activo = req.body?.activo;
    const professionalId = req.body?.professionalId != null && req.body.professionalId !== ""
      ? Number(req.body.professionalId)
      : null;

    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (!Number.isFinite(duracionMin) || duracionMin < SLOT_STEP_MIN) {
      return res.status(400).json({ error: `La duración mínima es ${SLOT_STEP_MIN} minutos.` });
    }

    if (USE_SUPABASE) {
      const patch = {
        nombre, descripcion, duracion_min: duracionMin, precio, categoria, professional_id: professionalId,
      };
      if (typeof activo === "boolean") patch.activo = activo;
      const { error } = await supabase.from("services").update(patch)
        .eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    await dbRun(
      `UPDATE services SET nombre=?, descripcion=?, duracion_min=?, precio=?, categoria=?, professional_id=?, activo=?
       WHERE id=? AND business_id=?`,
      [
        nombre, descripcion, duracionMin, precio, categoria, professionalId,
        typeof activo === "boolean" ? (activo ? 1 : 0) : 1,
        id, req.business.id,
      ]
    );
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete("/api/:slug/admin/services/:id", resolveBusiness, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (USE_SUPABASE) {
      const { error } = await supabase.from("services").update({ activo: false })
        .eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    await dbRun(
      "UPDATE services SET activo = 0 WHERE id = ? AND business_id = ?",
      [id, req.business.id]
    );
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
    if (USE_SUPABASE) {
      const { error } = await supabase.from("plans").update({ activo: false })
        .eq("id", id).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    await dbRun("UPDATE plans SET activo = 0 WHERE id = ? AND business_id = ?", [id, req.business.id]);
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
    const horaInicio = parseInt(body.horaInicio, 10);
    const horaFin = parseInt(body.horaFin, 10);
    const precio = (body.precio || "0").trim();
    const ciudad = (body.ciudad || "").trim() || null;
    const barrio = (body.barrio || "").trim() || null;
    const colorMarca = (body.colorMarca || body.color_marca || "").trim() || null;
    let categoria = (body.categoria || "").trim();
    if (categoria && !CATEGORIAS.has(categoria)) {
      return res.status(400).json({ error: "Categoría inválida." });
    }
    if (!categoria) categoria = req.business.categoria;

    if (!nombre) return res.status(400).json({ error: "El nombre del negocio es obligatorio." });
    if (!Number.isFinite(horaInicio) || !Number.isFinite(horaFin) || horaInicio >= horaFin) {
      return res.status(400).json({ error: "Horario inválido: hora inicio debe ser menor a hora fin." });
    }
    if (horaInicio < 0 || horaFin > 24) {
      return res.status(400).json({ error: "Horario fuera de rango (0-24)." });
    }

    if (USE_SUPABASE) {
      const { error } = await supabase.from("businesses").update({
        nombre, whatsapp, transfer_alias: transferAlias, transfer_cbu: transferCbu,
        transfer_titular: transferTitular, hora_inicio: horaInicio, hora_fin: horaFin, precio,
        ciudad, barrio, color_marca: colorMarca, categoria,
      }).eq("id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    await dbRun(
      `UPDATE businesses SET nombre=?, whatsapp=?, transfer_alias=?, transfer_cbu=?, transfer_titular=?,
       hora_inicio=?, hora_fin=?, precio=?, ciudad=?, barrio=?, color_marca=?, categoria=? WHERE id=?`,
      [
        nombre, whatsapp, transferAlias, transferCbu, transferTitular,
        horaInicio, horaFin, precio, ciudad, barrio, colorMarca, categoria, req.business.id,
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

    const { salt, hash } = hashAdminPassword(passwordNuevo);
    const now = new Date().toISOString();

    if (USE_SUPABASE) {
      const { error } = await supabase.from("business_admins").update({
        password_salt: salt, password_hash: hash,
        password_salt_b: null, password_hash_b: null, actualizado_en: now,
      }).eq("business_id", req.business.id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    }
    await dbRun(
      `UPDATE business_admins SET password_salt=?, password_hash=?, password_salt_b=NULL, password_hash_b=NULL, actualizado_en=?
       WHERE business_id=?`,
      [salt, hash, now, req.business.id]
    );
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

// ============================================================
// SUPERADMIN
// ============================================================
app.post("/api/superadmin/login", async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const rlKey = `superadmin:${ip}`;
    if (!checkLoginRateLimit(rlKey)) {
      return res.status(429).json({ error: "Demasiados intentos. Esperá 15 minutos." });
    }
    const password = (req.body?.password || "").trim();
    const ok = await isValidSuperAdminPassword(password);
    if (!ok) {
      if (!SUPERADMIN_PASSWORD) {
        const hasDb = await verifySuperAdminFromDb(password);
        if (!hasDb) {
          return res.status(503).json({
            error: "Super-admin no habilitado. Configurá SUPERADMIN_PASSWORD o un admin_users.",
          });
        }
      }
      return res.status(401).json({ error: "Clave incorrecta." });
    }
    resetLoginRateLimit(rlKey);
    const token = createAdminSession(0);
    return res.json({ token, expiresInMs: ADMIN_SESSION_TTL_MS });
  } catch (error) { next(error); }
});

app.get("/api/superadmin/negocios", requireSuperAdmin, async (req, res, next) => {
  try {
    const estado = (req.query.estado || "").trim();
    if (USE_SQLITE) {
      const rows = estado && ESTADOS_NEGOCIO.has(estado)
        ? await dbAll("SELECT * FROM businesses WHERE estado = ? ORDER BY id ASC", [estado])
        : await dbAll("SELECT * FROM businesses ORDER BY id ASC");
      return res.json(rows.map((r) => ({
        id: r.id, slug: r.slug, nombre: r.nombre, categoria: r.categoria,
        ciudad: r.ciudad, barrio: r.barrio, colorMarca: r.color_marca,
        logoUrl: r.logo_url, plan: r.plan || "inicial", estado: r.estado,
        estadoMotivo: r.estado_motivo, creadoEn: r.creado_en,
      })));
    }
    if (USE_SUPABASE) {
      let query = supabase.from("businesses").select("*").order("id");
      if (estado && ESTADOS_NEGOCIO.has(estado)) query = query.eq("estado", estado);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return res.json((data || []).map((r) => ({
        id: r.id, slug: r.slug, nombre: r.nombre, categoria: r.categoria,
        ciudad: r.ciudad, barrio: r.barrio, colorMarca: r.color_marca,
        logoUrl: r.logo_url, plan: r.plan || "inicial", estado: r.estado,
        estadoMotivo: r.estado_motivo, creadoEn: r.creado_en,
      })));
    }
    return res.json([]);
  } catch (error) { next(error); }
});

app.get("/api/superadmin/clubs", requireSuperAdmin, (req, res, next) => {
  req.url = "/api/superadmin/negocios" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  return app._router.handle(req, res, next);
});

app.get("/api/superadmin/metrics", requireSuperAdmin, async (_req, res, next) => {
  try {
    const counts = {};
    for (const e of ESTADOS_NEGOCIO) counts[e] = 0;
    if (USE_SQLITE) {
      const rows = await dbAll("SELECT estado, COUNT(*) as cnt FROM businesses GROUP BY estado");
      for (const r of rows) counts[r.estado] = r.cnt;
    } else if (USE_SUPABASE) {
      const { data, error } = await supabase.from("businesses").select("estado");
      if (error) throw new Error(error.message);
      for (const r of data || []) counts[r.estado] = (counts[r.estado] || 0) + 1;
    }
    res.json({ byEstado: counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
  } catch (error) { next(error); }
});

app.post("/api/superadmin/negocios", requireSuperAdmin, async (req, res, next) => {
  try {
    const nombre = (req.body?.nombre || "").trim();
    const rawSlug = (req.body?.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const password = (req.body?.password || "").trim();
    const categoria = CATEGORIAS.has(req.body?.categoria) ? req.body.categoria : "otro";
    const ciudad = (req.body?.ciudad || "").trim() || null;
    const barrio = (req.body?.barrio || "").trim() || null;
    const plan = (await loadPlatformPlans())[req.body?.plan] ? req.body.plan : "inicial";

    if (!nombre || !rawSlug || !password) {
      return res.status(400).json({ error: "nombre, slug y password son requeridos." });
    }
    if (nombre.length > 100) return res.status(400).json({ error: "El nombre es demasiado largo." });
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(rawSlug) || rawSlug.length < 2) {
      return res.status(400).json({ error: "Slug inválido. Usá letras minúsculas, números y guiones." });
    }

    const now = new Date().toISOString();
    const { salt, hash } = hashAdminPassword(password);

    if (USE_SQLITE) {
      const existing = await dbGet("SELECT id FROM businesses WHERE slug = ? LIMIT 1", [rawSlug]);
      if (existing) return res.status(409).json({ error: `Ya existe un negocio con el slug "${rawSlug}".` });
      const result = await dbRun(
        `INSERT INTO businesses (
           slug, nombre, categoria, ciudad, barrio, color_marca, whatsapp,
           transfer_alias, transfer_cbu, transfer_titular,
           hora_inicio, hora_fin, precio, plan, estado, creado_en
         ) VALUES (?, ?, ?, ?, ?, '#0f766e', '', '', '', '', 9, 20, '0', ?, 'activo', ?)`,
        [rawSlug, nombre, categoria, ciudad, barrio, plan, now]
      );
      await dbRun(
        "INSERT INTO business_admins (business_id, password_salt, password_hash, actualizado_en) VALUES (?, ?, ?, ?)",
        [result.lastID, salt, hash, now]
      );
      return res.status(201).json({ ok: true, slug: rawSlug, nombre, id: result.lastID });
    }
    if (USE_SUPABASE) {
      const { data: existing } = await supabase.from("businesses").select("id").eq("slug", rawSlug).maybeSingle();
      if (existing) return res.status(409).json({ error: `Ya existe un negocio con el slug "${rawSlug}".` });
      const { data: biz, error: bizErr } = await supabase.from("businesses").insert({
        slug: rawSlug, nombre, categoria, ciudad, barrio, color_marca: "#0f766e",
        whatsapp: "", transfer_alias: "", transfer_cbu: "", transfer_titular: "",
        hora_inicio: 9, hora_fin: 20, precio: "0", plan, estado: "activo", creado_en: now,
      }).select().single();
      if (bizErr) throw new Error(bizErr.message);
      const { error: adminErr } = await supabase.from("business_admins").insert({
        business_id: biz.id, password_salt: salt, password_hash: hash,
        password_salt_b: null, password_hash_b: null, actualizado_en: now,
      });
      if (adminErr) throw new Error(adminErr.message);
      return res.status(201).json({ ok: true, slug: rawSlug, nombre, id: biz.id });
    }
    return res.status(503).json({ error: "No hay backend de datos disponible." });
  } catch (error) { next(error); }
});

app.post("/api/superadmin/clubs", requireSuperAdmin, (req, res, next) => {
  req.url = "/api/superadmin/negocios";
  return app._router.handle(req, res, next);
});

app.patch("/api/superadmin/negocios/:id/plan", requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const plan = (req.body?.plan || "").trim();
    const plans = await loadPlatformPlans();
    if (!plans[plan]) return res.status(400).json({ error: "Plan inválido." });

    if (USE_SQLITE) {
      const row = await dbGet("SELECT id FROM businesses WHERE id = ? LIMIT 1", [id]);
      if (!row) return res.status(404).json({ error: "Negocio no encontrado." });
      await dbRun("UPDATE businesses SET plan = ? WHERE id = ?", [plan, id]);
      return res.json({ ok: true, plan });
    }
    if (USE_SUPABASE) {
      const { error } = await supabase.from("businesses").update({ plan }).eq("id", id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true, plan });
    }
    return res.status(503).json({ error: "No hay backend disponible." });
  } catch (error) { next(error); }
});

app.patch("/api/superadmin/clubs/:id/plan", requireSuperAdmin, async (req, res, next) => {
  req.url = `/api/superadmin/negocios/${req.params.id}/plan`;
  return app._router.handle(req, res, next);
});

app.patch("/api/superadmin/negocios/:id/estado", requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const estado = (req.body?.estado || "").trim();
    const motivo = (req.body?.motivo || "").trim();
    if (!ESTADOS_NEGOCIO.has(estado)) return res.status(400).json({ error: "Estado inválido." });
    if (ESTADOS_CON_MOTIVO.has(estado) && !motivo) {
      return res.status(400).json({ error: "El motivo es obligatorio para este estado." });
    }

    if (USE_SQLITE) {
      const row = await dbGet("SELECT id FROM businesses WHERE id = ? LIMIT 1", [id]);
      if (!row) return res.status(404).json({ error: "Negocio no encontrado." });
      await dbRun(
        "UPDATE businesses SET estado = ?, estado_motivo = ? WHERE id = ?",
        [estado, motivo || null, id]
      );
      return res.json({ ok: true, estado, motivo: motivo || null });
    }
    if (USE_SUPABASE) {
      const { error } = await supabase.from("businesses")
        .update({ estado, estado_motivo: motivo || null }).eq("id", id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true, estado, motivo: motivo || null });
    }
    return res.status(503).json({ error: "No hay backend disponible." });
  } catch (error) { next(error); }
});

app.patch("/api/superadmin/clubs/:id/activo", requireSuperAdmin, async (req, res, next) => {
  try {
    const activo = req.body?.activo;
    if (typeof activo === "boolean") {
      req.body.estado = activo ? "activo" : "pausado";
      if (!activo && !req.body.motivo) req.body.motivo = "Desactivado por superadmin";
    }
    req.url = `/api/superadmin/negocios/${req.params.id}/estado`;
    return app._router.handle(req, res, next);
  } catch (error) { next(error); }
});

app.patch("/api/superadmin/negocios/:id/logo", requireSuperAdmin, logoUpload.single("logo"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: "No se recibió imagen." });
    const validMagic = await validateFileMagicBytes(req.file);
    if (!validMagic) return res.status(400).json({ error: "Imagen inválida." });

    const ext = path.extname(req.file.originalname) || ".jpg";
    const filename = `${id}_${Date.now()}${ext}`;

    if (USE_SQLITE) {
      await fs.writeFile(path.join(LOGOS_DIR, filename), req.file.buffer);
      const logoUrl = `/uploads/logos/${filename}`;
      await dbRun("UPDATE businesses SET logo_url = ? WHERE id = ?", [logoUrl, id]);
      return res.json({ ok: true, logoUrl });
    }
    if (USE_SUPABASE) {
      const storagePath = `logos/${filename}`;
      const { error: uploadErr } = await supabase.storage
        .from(SUPABASE_BUCKET).upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype, upsert: true,
        });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: { publicUrl } } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);
      await supabase.from("businesses").update({ logo_url: publicUrl }).eq("id", id);
      return res.json({ ok: true, logoUrl: publicUrl });
    }
    return res.status(503).json({ error: "No hay backend disponible." });
  } catch (error) { next(error); }
});

app.patch("/api/superadmin/clubs/:id/logo", requireSuperAdmin, logoUpload.single("logo"), async (req, res, next) => {
  req.url = `/api/superadmin/negocios/${req.params.id}/logo`;
  return app._router.handle(req, res, next);
});

// ============================================================
// PLATFORM PLANS + SUSCRIPCION
// ============================================================
app.get("/api/suscripcion", (_req, res) => {
  res.json({
    precio: SUBSCRIPTION_PRECIO,
    alias: SUBSCRIPTION_ALIAS,
    cbu: SUBSCRIPTION_CBU,
    titular: SUBSCRIPTION_TITULAR,
  });
});

app.get("/api/planes", async (_req, res, next) => {
  try {
    const plans = await loadPlatformPlans();
    res.json(
      Object.entries(plans).map(([id, p]) => ({
        id,
        nombre: p.nombre,
        limiteProfesionales: p.limiteProfesionales,
        maxProfessionals: p.limiteProfesionales,
        precio: p.precio,
        alias: SUBSCRIPTION_ALIAS,
        cbu: SUBSCRIPTION_CBU,
        titular: SUBSCRIPTION_TITULAR,
        featured: id === "profesional",
      }))
    );
  } catch (error) { next(error); }
});

app.get("/api/superadmin/platform-plans", requireSuperAdmin, async (_req, res, next) => {
  try {
    const plans = await loadPlatformPlans();
    res.json(Object.entries(plans).map(([id, p]) => ({ id, ...p })));
  } catch (error) { next(error); }
});

// ============================================================
// SOLICITUDES
// ============================================================
app.post("/api/solicitudes", upload.single("comprobante"), async (req, res, next) => {
  try {
    const nombre = (req.body?.nombre || "").trim();
    const categoria = CATEGORIAS.has(req.body?.categoria)
      ? req.body.categoria
      : (CATEGORIAS.has(req.body?.deporte) ? "otro" : "otro");
    const ciudad = (req.body?.ciudad || "").trim() || null;
    const barrio = (req.body?.barrio || "").trim() || null;
    const whatsapp = (req.body?.whatsapp || "").trim().replace(/\D/g, "");
    const email = (req.body?.email || "").trim().toLowerCase();
    const plans = await loadPlatformPlans();
    const plan = plans[req.body?.plan] ? req.body.plan : "inicial";

    if (!nombre || nombre.length < 3) return res.status(400).json({ error: "Nombre inválido." });
    if (nombre.length > 100) return res.status(400).json({ error: "El nombre es demasiado largo." });
    if (!whatsapp || !email) {
      return res.status(400).json({ error: "Nombre, WhatsApp y email son requeridos." });
    }
    if (email.length > 150) return res.status(400).json({ error: "El email es inválido." });
    if (!req.file) return res.status(400).json({ error: "El comprobante de pago es requerido." });

    const validMagic = await validateFileMagicBytes(req.file);
    if (!validMagic) {
      if (req.file.path) fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: "El archivo no es válido." });
    }

    const slug = nombre
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);

    const now = new Date().toISOString();
    let comprobanteUrl = null;

    if (USE_SQLITE) {
      const ext = path.extname(req.file.originalname) || ".jpg";
      const filename = `sol_${Date.now()}${ext}`;
      const buf = req.file.buffer || await fs.readFile(req.file.path);
      await fs.writeFile(path.join(SOLICITUDES_DIR, filename), buf);
      comprobanteUrl = `/uploads/solicitudes/${filename}`;
      const result = await dbRun(
        `INSERT INTO solicitudes (nombre, slug, categoria, ciudad, barrio, whatsapp, email, comprobante_url, plan, estado, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
        [nombre, slug, categoria, ciudad, barrio, whatsapp, email, comprobanteUrl, plan, now]
      );
      return res.status(201).json({ ok: true, id: result.lastID });
    }
    if (USE_SUPABASE) {
      const ext = path.extname(req.file.originalname) || ".jpg";
      const filename = `solicitudes/sol_${Date.now()}${ext}`;
      const { error: upErr } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(filename, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filename);
      comprobanteUrl = urlData?.publicUrl || null;
      const { data, error } = await supabase.from("solicitudes").insert({
        nombre, slug, categoria, ciudad, barrio, whatsapp, email,
        comprobante_url: comprobanteUrl, plan, estado: "pendiente", creado_en: now,
      }).select().single();
      if (error) throw new Error(error.message);
      return res.status(201).json({ ok: true, id: data.id });
    }
    return res.status(503).json({ error: "No hay backend disponible." });
  } catch (error) { next(error); }
});

app.get("/api/superadmin/solicitudes", requireSuperAdmin, async (_req, res, next) => {
  try {
    if (USE_SQLITE) {
      return res.json(await dbAll("SELECT * FROM solicitudes ORDER BY creado_en DESC"));
    }
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("solicitudes").select("*").order("creado_en", { ascending: false });
      if (error) throw new Error(error.message);
      return res.json(data || []);
    }
    return res.json([]);
  } catch (error) { next(error); }
});

app.patch("/api/superadmin/solicitudes/:id/aprobar", requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const password = (req.body?.password || "").trim();
    const slugOverride = (req.body?.slug || "").trim();
    if (!password) return res.status(400).json({ error: "La clave admin del negocio es requerida." });

    const { salt, hash } = hashAdminPassword(password);
    const now = new Date().toISOString();
    const plans = await loadPlatformPlans();

    async function approveSqlite() {
      const sol = await dbGet("SELECT * FROM solicitudes WHERE id = ? LIMIT 1", [id]);
      if (!sol) return res.status(404).json({ error: "Solicitud no encontrada." });
      if (sol.estado !== "pendiente") return res.status(400).json({ error: "La solicitud ya fue procesada." });

      const slug = slugOverride || sol.slug;
      const existing = await dbGet("SELECT id FROM businesses WHERE slug = ? LIMIT 1", [slug]);
      if (existing) return res.status(409).json({ error: `Ya existe un negocio con el slug "${slug}".` });

      const solPlan = plans[sol.plan] ? sol.plan : "inicial";
      const planInfo = plans[solPlan] || PLANES_FALLBACK.inicial;
      const result = await dbRun(
        `INSERT INTO businesses (
           slug, nombre, categoria, ciudad, barrio, color_marca, whatsapp,
           transfer_alias, transfer_cbu, transfer_titular,
           hora_inicio, hora_fin, precio, plan, estado, creado_en
         ) VALUES (?, ?, ?, ?, ?, '#0f766e', ?, '', '', '', 9, 20, '0', ?, 'activo', ?)`,
        [slug, sol.nombre, sol.categoria || "otro", sol.ciudad || null, sol.barrio || null, sol.whatsapp, solPlan, now]
      );
      await dbRun(
        "INSERT INTO business_admins (business_id, password_salt, password_hash, actualizado_en) VALUES (?, ?, ?, ?)",
        [result.lastID, salt, hash, now]
      );
      await dbRun(
        `INSERT INTO platform_payments (business_id, plan_id, monto, comprobante_url, creado_en)
         VALUES (?, ?, ?, ?, ?)`,
        [result.lastID, solPlan, planInfo.precio, sol.comprobante_url || null, now]
      );
      await dbRun("UPDATE solicitudes SET estado = 'aprobada' WHERE id = ?", [id]);
      return res.json({ ok: true, slug, nombre: sol.nombre, businessId: result.lastID });
    }

    async function approveSupabase() {
      const { data: sol, error: solErr } = await supabase.from("solicitudes").select("*").eq("id", id).maybeSingle();
      if (solErr || !sol) return res.status(404).json({ error: "Solicitud no encontrada." });
      if (sol.estado !== "pendiente") return res.status(400).json({ error: "La solicitud ya fue procesada." });

      const slug = slugOverride || sol.slug;
      const { data: existing } = await supabase.from("businesses").select("id").eq("slug", slug).maybeSingle();
      if (existing) return res.status(409).json({ error: `Ya existe un negocio con el slug "${slug}".` });

      const solPlan = plans[sol.plan] ? sol.plan : "inicial";
      const planInfo = plans[solPlan] || PLANES_FALLBACK.inicial;
      const { data: biz, error: bizErr } = await supabase.from("businesses").insert({
        slug, nombre: sol.nombre, categoria: sol.categoria || "otro",
        ciudad: sol.ciudad || null, barrio: sol.barrio || null, color_marca: "#0f766e",
        whatsapp: sol.whatsapp, transfer_alias: "", transfer_cbu: "", transfer_titular: "",
        hora_inicio: 9, hora_fin: 20, precio: "0", plan: solPlan, estado: "activo", creado_en: now,
      }).select().single();
      if (bizErr) throw new Error(bizErr.message);

      const { error: adminErr } = await supabase.from("business_admins").insert({
        business_id: biz.id, password_salt: salt, password_hash: hash,
        password_salt_b: null, password_hash_b: null, actualizado_en: now,
      });
      if (adminErr) throw new Error(adminErr.message);

      await supabase.from("platform_payments").insert({
        business_id: biz.id, plan_id: solPlan, monto: planInfo.precio,
        comprobante_url: sol.comprobante_url || null, creado_en: now,
      });
      await supabase.from("solicitudes").update({ estado: "aprobada" }).eq("id", id);
      return res.json({ ok: true, slug, nombre: sol.nombre, businessId: biz.id });
    }

    if (USE_SQLITE) return approveSqlite();
    if (USE_SUPABASE) return approveSupabase();
    return res.status(503).json({ error: "No hay backend disponible." });
  } catch (error) { next(error); }
});

app.patch("/api/superadmin/solicitudes/:id/rechazar", requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (USE_SQLITE) {
      const sol = await dbGet("SELECT id, estado FROM solicitudes WHERE id = ? LIMIT 1", [id]);
      if (!sol) return res.status(404).json({ error: "Solicitud no encontrada." });
      if (sol.estado !== "pendiente") return res.status(400).json({ error: "La solicitud ya fue procesada." });
      await dbRun("UPDATE solicitudes SET estado = 'rechazada' WHERE id = ?", [id]);
      return res.json({ ok: true });
    }
    if (USE_SUPABASE) {
      const { data: sol } = await supabase.from("solicitudes").select("id, estado").eq("id", id).maybeSingle();
      if (!sol) return res.status(404).json({ error: "Solicitud no encontrada." });
      if (sol.estado !== "pendiente") return res.status(400).json({ error: "La solicitud ya fue procesada." });
      await supabase.from("solicitudes").update({ estado: "rechazada" }).eq("id", id);
      return res.json({ ok: true });
    }
    return res.status(503).json({ error: "No hay backend disponible." });
  } catch (error) { next(error); }
});

// ============================================================
// PAGES
// ============================================================
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "home.html"));
});

app.get("/sumate", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "register.html"));
});

app.get("/registro", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "register.html"));
});

app.get("/superadmin", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "superadmin.html"));
});

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
      return res.status(400).json({ error: "El comprobante supera 5MB. Subí un archivo más liviano." });
    }
    return res.status(400).json({ error: "Error al subir comprobante." });
  }
  if (err.message) return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: "Error interno del servidor." });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`CMR Turnos en http://localhost:${PORT}`));
}

module.exports = app;
