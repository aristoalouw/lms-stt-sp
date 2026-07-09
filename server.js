const express = require("express");
const cors = require("cors");
const path = require("path");
const { readFile } = require("fs/promises");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(ROOT_DIR));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
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

app.post("/api/cetak-khs", async (req, res) => {
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LMS server berjalan di http://127.0.0.1:${PORT}`);
  });
}

module.exports = { app, calculateKhs, renderKhsPdf };
