require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const mysql = require("mysql2/promise");
const path = require("path");
const { readFile } = require("fs/promises");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const initialData = require("./data/initial-data.json");

const app = express();
const rawPort = process.env.PORT || 3000;
const PORT = Number(rawPort) || rawPort;
const ROOT_DIR = __dirname;
const SESSION_COOKIE = "lms_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "replace-this-session-secret";
const isProduction = process.env.NODE_ENV === "production";

function academicTermForDate(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 9) return `Ganjil ${year}/${year + 1}`;
  if (month === 1) return `Ganjil ${year - 1}/${year}`;
  return `Genap ${year - 1}/${year}`;
}

const CURRENT_ACTIVE_SEMESTER = academicTermForDate();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "20mb" }));
app.use(cookieParser());
app.use("/assets", express.static(path.join(ROOT_DIR, "assets")));

app.get(["/", "/index.html"], (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

app.get("/app.js", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "app.js"));
});

app.get("/styles.css", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "styles.css"));
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

const database = {
  driver: null,
  mysqlPool: null,
};

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, index: true },
    identity: { type: String, index: true },
    role: { type: String, required: true, enum: ["student", "lecturer", "staff", "admin"] },
    status: { type: String, default: "active" },
    passwordHash: { type: String, required: true },
  },
  { strict: false, timestamps: true },
);

const appDataSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

const MongoUser = mongoose.model("User", userSchema);
const MongoAppData = mongoose.model("AppData", appDataSchema);

function stripSensitive(value) {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["password", "passwordHash", "_id", "__v"].includes(key))
      .map(([key, item]) => [key, stripSensitive(item)]),
  );
}

function sanitizeUser(user) {
  return stripSensitive(typeof user.toObject === "function" ? user.toObject() : user);
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8,
  };
}

function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SESSION_SECRET, { expiresIn: "8h" });
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return res.status(401).json({ message: "Sesi login tidak ditemukan." });
    const payload = jwt.verify(token, SESSION_SECRET);
    const user = await findUserById(payload.sub);
    if (!user) return res.status(401).json({ message: "Sesi login tidak valid." });
    req.user = user;
    next();
  } catch {
    res.clearCookie(SESSION_COOKIE, getCookieOptions());
    return res.status(401).json({ message: "Sesi login tidak valid atau sudah berakhir." });
  }
}

async function requireDatabase(req, res, next) {
  if (!isDatabaseReady()) {
    return res.status(503).json({ message: "Database belum terhubung. Periksa DATABASE_URL/MYSQL_* atau MONGO_URI di environment hosting." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Hanya admin yang dapat mengubah pengaturan PDF KHS." });
  next();
}

function requireStaffOrAdmin(req, res, next) {
  if (!["staff", "admin"].includes(req.user?.role)) return res.status(403).json({ message: "Hanya staf atau admin yang dapat mengakses data ini." });
  next();
}

function withoutUsers(payload) {
  const copy = stripSensitive(payload || {});
  delete copy.users;
  return copy;
}

async function loadAppData() {
  const [record, users] = await Promise.all([loadStoredAppData(), findAllUsers()]);
  return {
    ...(record || withoutUsers(initialData)),
    users: users.map(sanitizeUser),
  };
}

async function syncUsers(incomingUsers = []) {
  const ids = [];
  for (const incoming of incomingUsers) {
    if (!incoming?.id || !incoming?.username || !incoming?.role) continue;
    ids.push(incoming.id);
    const password = String(incoming.password || "");
    const update = stripSensitive(incoming);
    if (password) update.passwordHash = await bcrypt.hash(password, 12);
    const existing = await findUserById(incoming.id);
    if (!password && existing?.passwordHash) update.passwordHash = existing.passwordHash;
    if (!existing && !update.passwordHash) {
      update.passwordHash = await bcrypt.hash(process.env.INITIAL_USER_PASSWORD || "ChangeMe123!", 12);
    }
    await upsertUser(update);
  }
  if (ids.length) await deleteUsersNotIn(ids);
}

async function ensureInitialData() {
  const userCount = await countUsers();
  if (userCount === 0) {
    const defaultUserPassword = process.env.INITIAL_USER_PASSWORD || "ChangeMe123!";
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || defaultUserPassword;
    for (const user of initialData.users || []) {
      const password = user.role === "admin" ? adminPassword : defaultUserPassword;
      await upsertUser({
        ...stripSensitive(user),
        passwordHash: await bcrypt.hash(password, 12),
      });
    }
  }

  if (!(await loadStoredAppData())) await saveStoredAppData(withoutUsers(initialData));
}

async function connectDatabase() {
  if (process.env.DATABASE_URL || process.env.MYSQL_HOST || process.env.MYSQL_DATABASE) {
    database.driver = "mysql";
    database.mysqlPool = process.env.DATABASE_URL
      ? mysql.createPool(process.env.DATABASE_URL)
      : mysql.createPool({
          host: process.env.MYSQL_HOST || "localhost",
          port: Number(process.env.MYSQL_PORT || 3306),
          user: process.env.MYSQL_USER,
          password: process.env.MYSQL_PASSWORD,
          database: process.env.MYSQL_DATABASE,
          waitForConnections: true,
          connectionLimit: 10,
        });
    await ensureMysqlSchema();
    await ensureInitialData();
    return;
  }

  if (process.env.MONGO_URI) {
    database.driver = "mongo";
    await mongoose.connect(process.env.MONGO_URI);
    await ensureInitialData();
    return;
  }

  console.warn("Database belum diatur. Isi DATABASE_URL/MYSQL_* untuk Hostinger cPanel atau MONGO_URI untuk MongoDB.");
}

function isDatabaseReady() {
  if (database.driver === "mysql") return Boolean(database.mysqlPool);
  if (database.driver === "mongo") return mongoose.connection.readyState === 1;
  return false;
}

async function ensureMysqlSchema() {
  await database.mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS lms_users (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      username VARCHAR(191) NOT NULL UNIQUE,
      email VARCHAR(255) NULL,
      identity_value VARCHAR(191) NULL,
      role VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      password_hash VARCHAR(255) NOT NULL,
      data LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_lms_users_email (email),
      INDEX idx_lms_users_identity (identity_value)
    )
  `);

  await database.mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS lms_app_data (
      data_key VARCHAR(191) NOT NULL PRIMARY KEY,
      data LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

function mysqlUserFromRow(row) {
  if (!row) return null;
  return {
    ...parseJson(row.data, {}),
    id: row.id,
    username: row.username,
    email: row.email,
    identity: row.identity_value,
    role: row.role,
    status: row.status,
    passwordHash: row.password_hash,
  };
}

async function countUsers() {
  if (database.driver === "mysql") {
    const [rows] = await database.mysqlPool.execute("SELECT COUNT(*) AS total FROM lms_users");
    return Number(rows[0]?.total || 0);
  }
  return MongoUser.countDocuments();
}

async function findAllUsers() {
  if (database.driver === "mysql") {
    const [rows] = await database.mysqlPool.execute("SELECT * FROM lms_users ORDER BY role, JSON_UNQUOTE(JSON_EXTRACT(data, '$.name'))");
    return rows.map(mysqlUserFromRow);
  }
  return MongoUser.find({}).sort({ role: 1, name: 1 });
}

async function findUserById(id) {
  if (database.driver === "mysql") {
    const [rows] = await database.mysqlPool.execute("SELECT * FROM lms_users WHERE id = ? AND status = 'active' LIMIT 1", [id]);
    return mysqlUserFromRow(rows[0]);
  }
  return MongoUser.findOne({ id, status: "active" });
}

async function findUserForLogin(identifier) {
  if (database.driver === "mysql") {
    const [rows] = await database.mysqlPool.execute(
      "SELECT * FROM lms_users WHERE status = 'active' AND (LOWER(username) = ? OR LOWER(email) = ? OR LOWER(identity_value) = ?) LIMIT 1",
      [identifier, identifier, identifier],
    );
    return mysqlUserFromRow(rows[0]);
  }
  return MongoUser.findOne({
    status: "active",
    $or: [{ username: identifier }, { email: identifier }, { identity: identifier }],
  });
}

async function upsertUser(user) {
  if (database.driver === "mysql") {
    const publicData = stripSensitive(user);
    await database.mysqlPool.execute(
      `
        INSERT INTO lms_users (id, username, email, identity_value, role, status, password_hash, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          username = VALUES(username),
          email = VALUES(email),
          identity_value = VALUES(identity_value),
          role = VALUES(role),
          status = VALUES(status),
          password_hash = VALUES(password_hash),
          data = VALUES(data)
      `,
      [
        user.id,
        user.username,
        user.email || null,
        user.identity || null,
        user.role,
        user.status || "active",
        user.passwordHash,
        JSON.stringify(publicData),
      ],
    );
    return;
  }
  await MongoUser.findOneAndUpdate({ id: user.id }, user, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function deleteUsersNotIn(ids) {
  if (database.driver === "mysql") {
    const placeholders = ids.map(() => "?").join(",");
    await database.mysqlPool.execute(`DELETE FROM lms_users WHERE id NOT IN (${placeholders})`, ids);
    return;
  }
  await MongoUser.deleteMany({ id: { $nin: ids } });
}

async function loadStoredAppData() {
  return loadStoredConfig("main");
}

async function saveStoredAppData(payload) {
  return saveStoredConfig("main", payload);
}

async function loadStoredConfig(key) {
  if (database.driver === "mysql") {
    const [rows] = await database.mysqlPool.execute("SELECT data FROM lms_app_data WHERE data_key = ? LIMIT 1", [key]);
    return rows[0] ? parseJson(rows[0].data, null) : null;
  }
  const record = await MongoAppData.findOne({ key });
  return record?.data || null;
}

async function saveStoredConfig(key, payload) {
  if (database.driver === "mysql") {
    await database.mysqlPool.execute(
      `
        INSERT INTO lms_app_data (data_key, data)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE data = VALUES(data)
      `,
      [key, JSON.stringify(payload)],
    );
    return;
  }
  await MongoAppData.findOneAndUpdate({ key }, { key, data: payload }, { upsert: true, new: true });
}

app.post("/api/auth/login", requireDatabase, async (req, res) => {
  const identifier = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = await findUserForLogin(identifier);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: "Login gagal. Periksa username, email, NIM/NIDN, password, atau status akun." });
  }

  res.cookie(SESSION_COOKIE, createToken(user), getCookieOptions());
  res.json({ user: sanitizeUser(user) });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, getCookieOptions());
  res.json({ ok: true });
});

app.get("/api/auth/me", requireDatabase, requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.get("/api/data", requireDatabase, requireAuth, async (_req, res) => {
  res.json(await loadAppData());
});

app.put("/api/data", requireDatabase, requireAuth, async (req, res) => {
  if (!req.body || typeof req.body !== "object") return res.status(400).json({ message: "Payload data tidak valid." });
  await syncUsers(req.body.users || []);
  await saveStoredAppData(withoutUsers(req.body));
  res.json(await loadAppData());
});

app.get("/api/admin/settings", requireDatabase, requireAuth, requireAdmin, async (_req, res) => {
  res.json({ settings: await loadKhsPdfSettings() });
});

app.post("/api/admin/update-settings", requireDatabase, requireAuth, requireAdmin, async (req, res) => {
  if (!req.body || typeof req.body !== "object") return res.status(400).json({ message: "Payload pengaturan tidak valid." });
  const current = await loadKhsPdfSettings();
  const next = normalizePdfSettings(deepMerge(current, req.body));
  await saveStoredConfig("pdf_settings", next);
  res.json({
    ok: true,
    message: "Pengaturan PDF KHS berhasil disimpan.",
    settings: next,
  });
});

app.get("/api/admin/khs-form-responses.pdf", requireDatabase, requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const appData = await loadAppData();
    const pdfBuffer = await renderKhsFormResponsesPdf(appData, {
      semester: String(req.query.semester || CURRENT_ACTIVE_SEMESTER),
      cohort: String(req.query.cohort || "all"),
      studentId: String(req.query.studentId || "all"),
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=jawaban-form-khs.pdf");
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Gagal export jawaban form KHS:", error);
    res.status(500).json({ message: "Gagal export jawaban form KHS.", detail: error.message });
  }
});

function roundTwo(value) {
  return Math.round((Number(value) + 1e-9) * 100) / 100;
}

function calculateKhs(mataKuliah = []) {
  const nilaiMap = {
    A: 4.0,
    "A-": 3.7,
    "B+": 3.3,
    B: 3.0,
    "B-": 2.7,
    "C+": 2.4,
    C: 2.0,
    "C-": 1.7,
    D: 1.0,
    E: 0.0,
  };
  const rows = mataKuliah.map((item, index) => {
    const sks = Number(item.sks || 0);
    const nilaiHuruf = String(item.nilai_huruf || "").toUpperCase();
    const bobotAngka = nilaiMap[nilaiHuruf] ?? 0;
    return {
      no: index + 1,
      kode: String(item.kode || ""),
      nama_mk: String(item.nama_mk || ""),
      sks,
      nilai_huruf: nilaiHuruf,
      bobot_angka: bobotAngka,
      sks_x_nilai: roundTwo(sks * bobotAngka),
    };
  });

  const total_sks = rows.reduce((total, row) => total + row.sks, 0);
  const total_sks_x_nilai = roundTwo(rows.reduce((total, row) => total + row.sks_x_nilai, 0));
  const ips = total_sks ? roundTwo(total_sks_x_nilai / total_sks) : 0;

  return { rows, total_sks, total_sks_x_nilai, ips };
}

function assertPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Payload tidak valid.");
  if (!payload.mahasiswa || typeof payload.mahasiswa !== "object") throw new Error("Data mahasiswa wajib diisi.");
  if (!Array.isArray(payload.mata_kuliah)) throw new Error("Data mata_kuliah wajib berupa array.");
}

function khsPrintStatus(appData, studentId, semester = CURRENT_ACTIVE_SEMESTER) {
  const requiredForms = (appData.khsForms || []).filter((form) => form.active !== false && form.requiredForPrint !== false && form.semester === semester);
  const completedFormIds = requiredForms
    .filter((form) => (appData.khsFormSubmissions || []).some((submission) => submission.formId === form.id && submission.studentId === studentId && submission.semester === semester))
    .map((form) => form.id);
  return {
    requiredForms,
    completedFormIds,
    missingForms: requiredForms.filter((form) => !completedFormIds.includes(form.id)),
    unlocked: requiredForms.length === 0 || completedFormIds.length === requiredForms.length,
  };
}

function inferCohortFromIdentity(identity) {
  const value = String(identity || "");
  const fullYear = value.match(/20\d{2}/)?.[0];
  if (fullYear) return fullYear;
  const shortYear = value.match(/^\d{2}/)?.[0];
  return shortYear ? `20${shortYear}` : String(new Date().getFullYear());
}

function studentCohort(student) {
  return String(student?.tahun_angkatan || inferCohortFromIdentity(student?.identity));
}

function formatAnswerValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "-");
}

function drawText(page, text, x, y, font, size = 9, options = {}) {
  page.drawText(String(text ?? ""), {
    x,
    y,
    size,
    font,
    color: options.color || rgb(0, 0, 0),
    maxWidth: options.maxWidth,
    lineHeight: options.lineHeight,
  });
}

function drawWrappedText(pdfDoc, pageRef, text, x, yRef, font, size, maxWidth, options = {}) {
  let page = pageRef.page;
  let y = yRef.value;
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  if (!lines.length) lines.push("-");
  lines.forEach((item) => {
    if (y < 54) {
      page = pdfDoc.addPage([595.28, 841.89]);
      pageRef.page = page;
      y = 790;
    }
    drawText(page, item, x, y, font, size, options);
    y -= size + 5;
  });
  yRef.value = y;
}

async function renderKhsFormResponsesPdf(appData, filters = {}) {
  const semester = filters.semester || CURRENT_ACTIVE_SEMESTER;
  const cohort = filters.cohort || "all";
  const studentId = filters.studentId || "all";
  const forms = (appData.khsForms || []).filter((form) => form.semester === semester);
  const students = (appData.users || [])
    .filter((user) => user.role === "student")
    .filter((student) => cohort === "all" || studentCohort(student) === String(cohort))
    .filter((student) => studentId === "all" || student.id === studentId)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageRef = { page: pdfDoc.addPage([595.28, 841.89]) };
  const yRef = { value: 790 };
  const marginX = 44;
  const contentWidth = 507;

  drawText(pageRef.page, "Laporan Jawaban Form KHS", marginX, yRef.value, boldFont, 16);
  yRef.value -= 22;
  drawText(pageRef.page, `Semester: ${semester}`, marginX, yRef.value, font, 10);
  yRef.value -= 14;
  drawText(pageRef.page, `Filter: ${cohort === "all" ? "Semua angkatan" : `Angkatan ${cohort}`} / ${studentId === "all" ? "Semua mahasiswa" : "Perorangan"}`, marginX, yRef.value, font, 10);
  yRef.value -= 26;

  if (!students.length) {
    drawText(pageRef.page, "Tidak ada mahasiswa sesuai filter.", marginX, yRef.value, font, 10);
    return Buffer.from(await pdfDoc.save());
  }

  students.forEach((student) => {
    if (yRef.value < 120) {
      pageRef.page = pdfDoc.addPage([595.28, 841.89]);
      yRef.value = 790;
    }
    drawText(pageRef.page, `${student.name || "-"} (${student.identity || "-"})`, marginX, yRef.value, boldFont, 12);
    yRef.value -= 15;
    drawText(pageRef.page, `Angkatan ${studentCohort(student)} - ${student.program || "Teologi S1"}`, marginX, yRef.value, font, 9);
    yRef.value -= 16;

    forms.forEach((form) => {
      const submission = (appData.khsFormSubmissions || []).find((item) => item.formId === form.id && item.studentId === student.id && item.semester === semester);
      drawText(pageRef.page, `${form.title}: ${submission ? "Sudah isi" : "Belum isi"}`, marginX + 12, yRef.value, boldFont, 10);
      yRef.value -= 14;
      if (submission) {
        (form.questions || []).forEach((question) => {
          drawWrappedText(pdfDoc, pageRef, `${question.label}:`, marginX + 24, yRef, boldFont, 9, contentWidth - 24);
          drawWrappedText(pdfDoc, pageRef, formatAnswerValue(submission.answers?.[question.id]), marginX + 36, yRef, font, 9, contentWidth - 36);
          yRef.value -= 3;
        });
        drawText(pageRef.page, `Dikirim: ${new Date(submission.submittedAt || submission.updatedAt || Date.now()).toLocaleString("id-ID")}`, marginX + 24, yRef.value, font, 8);
        yRef.value -= 14;
      } else {
        yRef.value -= 4;
      }
    });
    yRef.value -= 12;
  });

  return Buffer.from(await pdfDoc.save());
}

function formatDecimal(value) {
  return Number(value || 0).toFixed(2);
}

function safeFilename(value) {
  return String(value || "mahasiswa").replace(/[^a-zA-Z0-9_-]/g, "_");
}

const DEFAULT_KHS_PDF_SETTINGS = {
  header: {
    title: "SEKOLAH TINGGI TEOLOGI SAINT PAUL BANDUNG",
    titleFontSize: 15,
    titleColor: "#003b7a",
    bodyFontSize: 10,
    bodyColor: "#47515c",
    lineGap: 9,
    logo: {
      x: 46,
      yOffset: 48,
      width: 42,
      height: 42,
    },
    lines: [
      "Terdaftar di Departemen Agama RI - Ijin Dirjen Bimas Kristen",
      "Ijin Institusi: No. DJ/III/HK.05//217/2014",
      "Ijin Perpanjangan Prodi Teologi: No. 574 Tahun 2018",
      "Terakreditasi BAN-PT",
      "Institusi: 92/SK/BAN-PT/Ak-PKP/PT/II/2022",
      "Prodi Teologi S1: 837/SK/BAN-PT/Ak-PKP/S/II/2022",
      "Kampus 1: Jl. Purbasari No. 3 - Cimahi (022) 665 0982",
      "Kampus 2: Jl. Baranangsiang No. 8 ITC Kosambi - Bandung (022) 422 2120",
      "Email: admin@sttsaintpaul.ac.id / Website: www.sttsaintpaul.ac.id",
    ],
  },
  signature: {
    location: "Bandung",
    datePrefix: "",
    title: "Kepala Program Studi",
    program: "Teologi S1",
    name: "Fenius Gulo, M.Th.",
    identifierLabel: "NUPTK",
    identifier: "1234567890123456",
    fontSize: 9,
    nameFontSize: 9,
    identifierFontSize: 8.5,
    color: "#000000",
    image: {
      width: 120,
      height: 45,
      xOffset: 18,
      yOffset: 4,
    },
  },
  assets: {
    logoDataUrl: "",
    signatureDataUrl: "",
  },
};

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override === undefined ? base : override;
  if (!base || typeof base !== "object" || !override || typeof override !== "object") return override === undefined ? base : override;
  const result = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    result[key] = deepMerge(base[key], value);
  });
  return result;
}

function parsePdfColor(value, fallback = rgb(0, 0, 0)) {
  if (Array.isArray(value) && value.length >= 3) {
    return rgb(Number(value[0]) / 255, Number(value[1]) / 255, Number(value[2]) / 255);
  }
  if (value && typeof value === "object") {
    const scale = Math.max(Number(value.r || 0), Number(value.g || 0), Number(value.b || 0)) > 1 ? 255 : 1;
    return rgb(Number(value.r || 0) / scale, Number(value.g || 0) / scale, Number(value.b || 0) / scale);
  }
  const hex = String(value || "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  }
  return fallback;
}

function normalizeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/png|image\/jpe?g);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  return {
    mime: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

async function embedConfiguredImage(pdfDoc, dataUrl, fallbackPath) {
  let imageSource = normalizeDataUrl(dataUrl);
  if (!imageSource && fallbackPath) {
    try {
      const bytes = await readFile(fallbackPath);
      imageSource = { mime: fallbackPath.toLowerCase().endsWith(".jpg") || fallbackPath.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : "image/png", bytes };
    } catch {
      return null;
    }
  }
  if (!imageSource) return null;
  return imageSource.mime.includes("jpeg") ? pdfDoc.embedJpg(imageSource.bytes) : pdfDoc.embedPng(imageSource.bytes);
}

function normalizePdfSettings(input = {}) {
  const aliases = { ...input };
  aliases.assets = {
    ...(input.assets || {}),
    logoDataUrl: input.assets?.logoDataUrl || input.logoDataUrl || input.logoImageDataUrl || "",
    signatureDataUrl: input.assets?.signatureDataUrl || input.signatureDataUrl || input.ttdDataUrl || input.signatureImageDataUrl || "",
  };
  const merged = deepMerge(DEFAULT_KHS_PDF_SETTINGS, aliases);
  merged.header.lines = Array.isArray(merged.header.lines) ? merged.header.lines.map((line) => (typeof line === "string" ? line : line?.text || "")).filter(Boolean) : [];
  merged.header.titleFontSize = Number(merged.header.titleFontSize || DEFAULT_KHS_PDF_SETTINGS.header.titleFontSize);
  merged.header.bodyFontSize = Number(merged.header.bodyFontSize || DEFAULT_KHS_PDF_SETTINGS.header.bodyFontSize);
  merged.header.lineGap = Number(merged.header.lineGap || DEFAULT_KHS_PDF_SETTINGS.header.lineGap);
  merged.signature.fontSize = Number(merged.signature.fontSize || DEFAULT_KHS_PDF_SETTINGS.signature.fontSize);
  merged.signature.nameFontSize = Number(merged.signature.nameFontSize || DEFAULT_KHS_PDF_SETTINGS.signature.nameFontSize);
  merged.signature.identifierFontSize = Number(merged.signature.identifierFontSize || DEFAULT_KHS_PDF_SETTINGS.signature.identifierFontSize);
  return merged;
}

async function loadKhsPdfSettings() {
  return normalizePdfSettings((await loadStoredConfig("pdf_settings")) || {});
}

async function renderKhsPdf(payload, pdfSettings = DEFAULT_KHS_PDF_SETTINGS) {
  assertPayload(payload);
  const settings = normalizePdfSettings(pdfSettings);

  const templatePath = path.join(ROOT_DIR, "PDF", "Template_KHS_Kosong.pdf");
  const logoPath = path.join(ROOT_DIR, "PDF", "Logo_STT.png");
  const signaturePath = path.join(ROOT_DIR, "PDF", "TTD.png");
  const templateBytes = await readFile(templatePath);

  const pdfDoc = await PDFDocument.load(templateBytes);
  const logoImage = await embedConfiguredImage(pdfDoc, settings.assets.logoDataUrl, logoPath);
  const signatureImage = await embedConfiguredImage(pdfDoc, settings.assets.signatureDataUrl, signaturePath);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.getPages()[0] || pdfDoc.addPage();
  const { width, height } = page.getSize();
  const khs = calculateKhs(payload.mata_kuliah);

  const marginX = 46;
  const topY = height - 44;
  const dark = rgb(0.09, 0.12, 0.16);
  const headerTitleColor = parsePdfColor(settings.header.titleColor, dark);
  const headerBodyColor = parsePdfColor(settings.header.bodyColor, rgb(0.28, 0.32, 0.36));
  const signatureColor = parsePdfColor(settings.signature.color, rgb(0, 0, 0));

  if (logoImage) {
    page.drawImage(logoImage, {
      x: Number(settings.header.logo?.x || marginX),
      y: topY - Number(settings.header.logo?.yOffset || 48),
      width: Number(settings.header.logo?.width || 42),
      height: Number(settings.header.logo?.height || 42),
    });
  }

  const kopX = marginX + 52;
  let kopY = topY - 3;
  drawText(page, settings.header.title, kopX, kopY, boldFont, settings.header.titleFontSize, { color: headerTitleColor, maxWidth: width - kopX - marginX });
  kopY -= settings.header.lineGap;
  settings.header.lines.forEach((line) => {
    drawText(page, line, kopX, kopY, font, settings.header.bodyFontSize, { color: headerBodyColor, maxWidth: width - kopX - marginX });
    kopY -= settings.header.lineGap;
  });
  const separatorY = Math.min(topY - 58, kopY - 3);

  page.drawLine({
    start: { x: marginX, y: separatorY },
    end: { x: width - marginX, y: separatorY },
    thickness: 0.8,
    color: rgb(0.16, 0.24, 0.32),
  });

  let y = separatorY - 30;
  drawText(page, "KARTU HASIL STUDI", marginX, y, boldFont, 15, { color: dark });
  y -= 24;
  drawText(page, `Nama : ${payload.mahasiswa.nama || "-"}`, marginX, y, font, 9.5);
  drawText(page, `NIM : ${payload.mahasiswa.nim || "-"}`, marginX + 270, y, font, 9.5);
  y -= 16;
  drawText(page, `Prodi : ${payload.mahasiswa.prodi || "-"}`, marginX, y, font, 9.5);

  y -= 30;
  const columns = {
    no: marginX,
    kode: marginX + 34,
    nama: marginX + 96,
    sks: marginX + 340,
    nilai: marginX + 386,
    jumlah: marginX + 448,
  };

  page.drawRectangle({
    x: marginX - 6,
    y: y - 6,
    width: width - marginX * 2 + 12,
    height: 18,
    color: rgb(0.9, 0.95, 1),
  });
  drawText(page, "No", columns.no, y, boldFont, 8.5);
  drawText(page, "Kode", columns.kode, y, boldFont, 8.5);
  drawText(page, "Mata Kuliah", columns.nama, y, boldFont, 8.5);
  drawText(page, "SKS", columns.sks, y, boldFont, 8.5);
  drawText(page, "Nilai", columns.nilai, y, boldFont, 8.5);
  drawText(page, "SKS x Nilai", columns.jumlah, y, boldFont, 8.5);

  y -= 20;
  khs.rows.forEach((row) => {
    drawText(page, row.no, columns.no, y, font, 8.5);
    drawText(page, row.kode, columns.kode, y, font, 8.5);
    drawText(page, row.nama_mk, columns.nama, y, font, 8.5, { maxWidth: 230 });
    drawText(page, row.sks, columns.sks, y, font, 8.5);
    drawText(page, row.nilai_huruf, columns.nilai, y, font, 8.5);
    drawText(page, formatDecimal(row.sks_x_nilai), columns.jumlah, y, font, 8.5);
    y -= 20;
  });

  page.drawLine({
    start: { x: marginX, y: y + 9 },
    end: { x: width - marginX, y: y + 9 },
    thickness: 0.5,
    color: rgb(0.65, 0.7, 0.75),
  });

  drawText(page, `Total SKS: ${khs.total_sks}`, marginX, y - 8, boldFont, 9);
  drawText(page, `Total SKS x Nilai: ${formatDecimal(khs.total_sks_x_nilai)}`, marginX + 135, y - 8, boldFont, 9);
  drawText(page, `IPS: ${formatDecimal(khs.ips)}`, marginX + 350, y - 8, boldFont, 9);

  const printedAt = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const signatureX = width - 220;
  const signatureY = 104;
  drawText(page, `${settings.signature.location}, ${settings.signature.datePrefix || printedAt}`, signatureX, signatureY + 58, font, settings.signature.fontSize, { color: signatureColor });
  drawText(page, settings.signature.title, signatureX, signatureY + 42, font, settings.signature.fontSize, { color: signatureColor });
  drawText(page, settings.signature.program, signatureX, signatureY + 28, font, settings.signature.fontSize, { color: signatureColor });
  if (signatureImage) {
    page.drawImage(signatureImage, {
      x: signatureX + Number(settings.signature.image?.xOffset || 18),
      y: signatureY + Number(settings.signature.image?.yOffset || 4),
      width: Number(settings.signature.image?.width || 120),
      height: Number(settings.signature.image?.height || 45),
    });
  }
  drawText(page, settings.signature.name, signatureX, signatureY, boldFont, settings.signature.nameFontSize, { color: signatureColor });
  drawText(page, `${settings.signature.identifierLabel}. ${settings.signature.identifier}`, signatureX, signatureY - 14, font, settings.signature.identifierFontSize, { color: signatureColor });

  return Buffer.from(await pdfDoc.save());
}

app.post("/api/cetak-khs", requireDatabase, requireAuth, async (req, res) => {
  try {
    if (req.user?.role === "student") {
      const appData = await loadAppData();
      const semester = req.body?.semester || CURRENT_ACTIVE_SEMESTER;
      const status = khsPrintStatus(appData, req.user.id, semester);
      if (!status.unlocked) {
        return res.status(403).json({
          message: "Cetak KHS terkunci. Lengkapi semua form wajib terlebih dahulu.",
          required: status.requiredForms.length,
          completed: status.completedFormIds.length,
          missingForms: status.missingForms.map((form) => ({ id: form.id, title: form.title })),
        });
      }
    }
    const pdfBuffer = await renderKhsPdf(req.body, await loadKhsPdfSettings());
    const nim = safeFilename(req.body?.mahasiswa?.nim);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=KHS_${nim}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Gagal membuat PDF KHS:", error);
    res.status(500).json({
      message: "Gagal membuat PDF KHS.",
      detail: error.message,
    });
  }
});

const shouldListen = require.main === module || process.env.PASSENGER_APP_ENV || process.env.PASSENGER_BASE_URI || process.env.NODE_ENV === "production";

if (shouldListen) {
  connectDatabase()
    .catch((error) => {
      console.error("Gagal menghubungkan database:", error);
    })
    .finally(() => {
      app.listen(PORT, () => {
        console.log(`LMS server berjalan di http://127.0.0.1:${PORT}`);
      });
    });
}

module.exports = { app, calculateKhs, renderKhsPdf };
