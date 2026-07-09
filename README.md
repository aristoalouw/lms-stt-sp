# LMS STT SP

Aplikasi LMS berbasis Node/Express dengan frontend statis, autentikasi backend, session cookie `httpOnly`, dan penyimpanan data backend. Database dapat memakai MySQL Hostinger cPanel atau MongoDB Atlas.

## Menjalankan Lokal

1. Install dependency:

```powershell
npm install
```

2. Buat file `.env` dari `.env.example`, lalu isi minimal:

```text
MYSQL_HOST=localhost
MYSQL_DATABASE=nama_database
MYSQL_USER=user_database
MYSQL_PASSWORD=password_database
SESSION_SECRET=isi-random-panjang
INITIAL_ADMIN_PASSWORD=password-admin-awal
INITIAL_USER_PASSWORD=password-user-awal
```

3. Jalankan server:

```powershell
npm start
```

4. Buka:

```text
http://127.0.0.1:3000
```

## Deploy

Aplikasi berjalan sebagai satu layanan Node/Express.

Konfigurasi hosting:

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /health
```

Environment variables wajib:

```text
NODE_ENV=production
MYSQL_HOST=localhost
MYSQL_DATABASE=...
MYSQL_USER=...
MYSQL_PASSWORD=...
SESSION_SECRET=...
INITIAL_ADMIN_PASSWORD=...
INITIAL_USER_PASSWORD=...
```

`INITIAL_ADMIN_PASSWORD` dan `INITIAL_USER_PASSWORD` hanya dipakai saat database masih kosong. Setelah seed pertama dibuat, password tersimpan sebagai hash di MongoDB.

## Akun Awal

Saat database kosong, server membuat akun awal dari `data/initial-data.json`. Username awal mengikuti data seed, tetapi passwordnya diambil dari environment:

- Administrator: `INITIAL_ADMIN_PASSWORD`
- Mahasiswa/dosen/staf: `INITIAL_USER_PASSWORD`

Segera ubah password dan data akun lewat menu admin setelah login pertama.

## Fitur Utama

- Login backend dengan password hash dan cookie session.
- Dashboard mahasiswa, dosen, staf akademik, dan admin.
- KHS, pengumuman, kalender akademik, dan data akademik.
- Admin/staf dapat mengelola dosen, mahasiswa, mata kuliah, nilai, pengumuman, dan kalender akademik.
- Endpoint `POST /api/cetak-khs` membuat PDF KHS server-side dengan Express dan `pdf-lib`.
- Data aplikasi disimpan di database backend, bukan `localStorage`.

## API Pengaturan PDF KHS

Admin dapat membaca dan memperbarui konfigurasi PDF KHS melalui:

```text
GET  /api/admin/settings
POST /api/admin/update-settings
```

Contoh payload `POST /api/admin/update-settings`:

```json
{
  "header": {
    "title": "SEKOLAH TINGGI TEOLOGI SAINT PAUL BANDUNG",
    "titleFontSize": 15,
    "titleColor": "#003b7a",
    "bodyFontSize": 10,
    "bodyColor": "#47515c",
    "lines": [
      "Ijin Institusi: No. ...",
      "Akreditasi: ...",
      "Alamat: ...",
      "Email: admin@sttsaintpaul.ac.id / Website: www.sttsaintpaul.ac.id"
    ]
  },
  "signature": {
    "title": "Kepala Program Studi",
    "program": "Teologi S1",
    "name": "Nama Dosen, M.Th.",
    "identifierLabel": "NUPTK",
    "identifier": "1234567890123456",
    "fontSize": 9,
    "color": "#000000"
  },
  "assets": {
    "logoDataUrl": "data:image/png;base64,...",
    "signatureDataUrl": "data:image/png;base64,..."
  }
}
```

Nilai warna dapat memakai hex (`#003b7a`), array RGB (`[0, 59, 122]`), atau objek RGB (`{"r":0,"g":59,"b":122}`). Aset gambar dapat berupa PNG atau JPG dalam format data URL base64.
