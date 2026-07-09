# LMS Universitas Nusantara

Website demo LMS berbasis PRD untuk universitas skala menengah. Aplikasi ini dibuat sebagai prototipe statis dengan data contoh di browser.

## Cara Menjalankan

Buka langsung:

```text
index.html
```

Untuk fitur PDF server-side, jalankan Express dari folder proyek pada port `3000`:

```powershell
node server.js
```

atau:

```powershell
npm start
```

Lalu jalankan frontend statis pada port `8000`:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Kemudian buka:

```text
http://127.0.0.1:8000/index.html
```

Jika hanya ingin membuka prototipe statis tanpa endpoint PDF, gunakan server lokal sederhana:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Lalu buka:

```text
http://127.0.0.1:8000/index.html
```

## Deploy

Aplikasi dapat dijalankan sebagai satu layanan Node/Express karena `server.js` sudah menyajikan file statis dari folder proyek dan endpoint PDF.

Checklist sebelum deploy:

1. Pastikan dependency aman:

```powershell
npm install
```

2. Jalankan lokal:

```powershell
npm start
```

3. Cek health check:

```text
http://127.0.0.1:3000/health
```

4. Upload project ke repository GitHub/GitLab/Bitbucket.
5. Buat Web Service di hosting Node.js, misalnya Render.
6. Gunakan konfigurasi:

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /health
```

7. Isi environment variables dari `.env.example` di dashboard hosting. Jangan upload file `.env`.

Catatan penting: versi saat ini masih memakai login demo berbasis `localStorage`. Untuk deploy produksi, pindahkan autentikasi dan data utama ke backend/database terlebih dahulu.

## Akun Demo

Semua password demo:

```text
demo123
```

- Mahasiswa: `mahasiswa01`
- Dosen: `dosen01`
- Staf Akademik: `staf01`
- Administrator: `admin01`

## Fitur Utama

- Login simulasi dan akses berbasis role.
- Dashboard mahasiswa, dosen, staf akademik, dan admin.
- Menu aktif: Dashboard, Nilai, Pengumuman, dan Kalender Akademik.
- Admin dan staf dapat menambah, mengedit, dan menghapus Pengumuman serta Kalender Akademik.
- Staf akademik dan admin dapat mengelola Data Akademik: dosen, mahasiswa, mata kuliah, serta sinkronisasi dosen-mahasiswa berdasarkan semester dan mata kuliah.
- Staf akademik dan admin dapat menambah, mengedit, dan menghapus data dosen/mahasiswa/mata kuliah.
- Data mahasiswa memiliki `tahun_angkatan`, ditampilkan berkelompok per angkatan, dan daftar mata kuliah mahasiswa memakai dropdown collapsible.
- Data Akademik memiliki filter `Semester Berjalan` historis dari `Ganjil 2026/2027` mundur sampai 2020.
- Submenu Mata Kuliah dikelompokkan berdasarkan `Semester 1` sampai `Semester 8`; aksi edit/hapus di Dosen, Mahasiswa, dan Mata Kuliah dikendalikan tombol global `EDIT`.
- Staf akademik dan admin dapat input nilai mahasiswa di menu Nilai; nomor nilai otomatis, SKS x Nilai dan IPS dihitung dari bobot nilai huruf atau bobot angka manual.
- Staf akademik dan admin dapat upload satu kop surat aktif untuk hasil cetak KHS dalam format PDF atau PNG, serta menghapusnya.
- Endpoint `POST /api/cetak-khs` membuat file PDF KHS server-side dengan Express dan `pdf-lib`.
- Script `PDF/generate-khs-pdf.mjs` menyediakan contoh otomasi PDF KHS mandiri dengan `pdf-lib`.
- Notifikasi hanya dibuat dari Pengumuman dan Kalender Akademik; notifikasi terkait otomatis tidak ditampilkan ketika sumbernya dihapus.
- Menu arsip di kode: Kelas, Materi, Tugas, Kuis, Absensi, Laporan, Pengguna, Akademik, Integrasi, dan Audit Log.
- Data contoh tersimpan di `localStorage` browser.
- Export laporan CSV dari modul laporan atau gradebook.
