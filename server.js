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

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
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
  if (database.driver === "mysql") {
    const [rows] = await database.mysqlPool.execute("SELECT data FROM lms_app_data WHERE data_key = 'main' LIMIT 1");
    return rows[0] ? parseJson(rows[0].data, null) : null;
  }
  const record = await MongoAppData.findOne({ key: "main" });
  return record?.data || null;
}

async function saveStoredAppData(payload) {
  if (database.driver === "mysql") {
    await database.mysqlPool.execute(
      `
        INSERT INTO lms_app_data (data_key, data)
        VALUES ('main', ?)
        ON DUPLICATE KEY UPDATE data = VALUES(data)
      `,
      [JSON.stringify(payload)],
    );
    return;
  }
  await MongoAppData.findOneAndUpdate({ key: "main" }, { key: "main", data: payload }, { upsert: true, new: true });
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

function roundTwo(value) {
  return Math.round((Number(value) + 1e-9) * 100) / 100;
}

function calculateKhs(mataKuliah = []) {
  const rows = mataKuliah.map((item, index) => {
    const sks = Number(item.sks || 0);
    const bobotAngka = Number(item.bobot_angka || 0);
    return {
      no: index + 1,
      kode: String(item.kode || ""),
      nama_mk: String(item.nama_mk || ""),
      sks,
      nilai_huruf: String(item.nilai_huruf || ""),
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

function formatDecimal(value) {
  return Number(value || 0).toFixed(2);
}

function safeFilename(value) {
  return String(value || "mahasiswa").replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function renderKhsPdf(payload) {
  assertPayload(payload);

  const templatePath = path.join(ROOT_DIR, "PDF", "Template_KHS_Kosong.pdf");
  const logoPath = path.join(ROOT_DIR, "PDF", "Logo_STT.png");
  const [templateBytes, logoBytes] = await Promise.all([readFile(templatePath), readFile(logoPath)]);

  const pdfDoc = await PDFDocument.load(templateBytes);
  const logoImage = await pdfDoc.embedPng(logoBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.getPages()[0] || pdfDoc.addPage();
  const { width, height } = page.getSize();
  const khs = calculateKhs(payload.mata_kuliah);

  const marginX = 46;
  const topY = height - 44;
  const dark = rgb(0.09, 0.12, 0.16);
  const muted = rgb(0.28, 0.32, 0.36);

  page.drawImage(logoImage, {
    x: marginX,
    y: topY - 48,
    width: 42,
    height: 42,
  });

  const kopX = marginX + 52;
  let kopY = topY - 3;
  drawText(page, "SEKOLAH TINGGI TEOLOGI SAINT PAUL BANDUNG", kopX, kopY, boldFont, 7.5, { color: dark });
  kopY -= 9;
  drawText(page, "Jl. Cihanjuang KM. 2.5 No. 1, Bandung Barat", kopX, kopY, font, 7.5, { color: muted });
  kopY -= 9;
  drawText(page, "Telp. (022) 123456 | Email: akademik@sttsp.ac.id", kopX, kopY, font, 7.5, { color: muted });
  kopY -= 9;
  drawText(page, "Website: www.sttsp.ac.id", kopX, kopY, font, 7.5, { color: muted });

  page.drawLine({
    start: { x: marginX, y: topY - 58 },
    end: { x: width - marginX, y: topY - 58 },
    thickness: 0.8,
    color: rgb(0.16, 0.24, 0.32),
  });

  let y = topY - 88;
  drawText(page, "KARTU HASIL STUDI", marginX, y, boldFont, 12, { color: dark });
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
  drawText(page, "Nama MK", columns.nama, y, boldFont, 8.5);
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
  drawText(page, `Bandung, ${printedAt}`, signatureX, signatureY + 58, font, 9);
  drawText(page, "Kepala Program Studi", signatureX, signatureY + 42, font, 9);
  drawText(page, "Teologi S1", signatureX, signatureY + 28, font, 9);
  drawText(page, "Dr. Samuel Pratama, M.Th.", signatureX, signatureY, boldFont, 9);
  drawText(page, "NUPTK. 1234567890123456", signatureX, signatureY - 14, font, 8.5);

  return Buffer.from(await pdfDoc.save());
}

app.post("/api/cetak-khs", requireDatabase, requireAuth, async (req, res) => {
  try {
    const pdfBuffer = await renderKhsPdf(req.body);
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
  app.listen(PORT, () => {
    console.log(`LMS server berjalan di http://127.0.0.1:${PORT}`);
  });
}

module.exports = { app, calculateKhs, renderKhsPdf };
