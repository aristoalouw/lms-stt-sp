# Skill Menu Nilai

## Tujuan

Menu Nilai mengelola input nilai oleh staf akademik/admin dan menampilkan Kartu Hasil Studi (KHS) mahasiswa. Data KHS mahasiswa selalu berasal dari input staf, master mata kuliah, dan data akademik mahasiswa.

## Role

- Mahasiswa melihat KHS miliknya sendiri.
- Staf akademik dan admin memasukkan nilai per mahasiswa.
- Dosen tetap melihat gradebook kelas untuk kebutuhan pemantauan akademik.

## Input Staf Akademik

Staf memilih mahasiswa dan mata kuliah dari data akademik, lalu mengisi nilai huruf.
Tabel nilai staf hanya menampilkan data KHS mahasiswa yang sedang dipilih. Jika mahasiswa belum memiliki nilai, tabel menampilkan keadaan kosong tanpa membawa nilai mahasiswa lain.
Staf/admin dapat memfilter pilihan mahasiswa berdasarkan tahun angkatan.

Kolom data nilai:

- `No` dibuat otomatis berurutan per mahasiswa.
- `Kode` berasal dari master mata kuliah.
- `Mata Kuliah` berasal dari master mata kuliah.
- `SKS` berasal dari master mata kuliah.
- `Nilai` berisi nilai huruf.
- `SKS X Nilai` dihitung otomatis.

Setiap baris mata kuliah memiliki tombol `Edit` sehingga staf dapat memperbarui nilai satu mata kuliah tanpa menghapus data KHS mahasiswa.

Nilai huruf default:

```text
A  = 4.0
A- = 3.7
B  = 3.0
```

Jika ada variasi bobot, staf dapat mengisi bobot angka langsung. Contoh: nilai huruf `A` dengan bobot `3.8`.

## Fungsi Perhitungan KHS

Fungsi menerima list of dictionaries:

```json
[
  { "mata_kuliah": "Psikologi Kepribadian", "sks": 2, "nilai_huruf": "A" }
]
```

Fungsi menghitung:

```text
SKS x Nilai = SKS * Bobot Angka
Total SKS = jumlah seluruh SKS
Total SKS x Nilai = jumlah seluruh SKS x Nilai
IPS = Total SKS x Nilai / Total SKS
```

IPS dibulatkan ke 2 angka di belakang koma.

## Tampilan Mahasiswa

- Tidak menampilkan Notes.
- Menampilkan badge `2025/2026 Ganjil` dan Prodi dari data akademik mahasiswa.
- Tombol `Cetak KHS` mencetak tabel yang sama dengan halaman nilai.
- Hasil cetak memuat kop surat jika tersedia, lalu Nama, NIM, Prodi, tabel KHS, total SKS, total bobot, dan IPS.

## Kop Surat

- Staf akademik/admin hanya dapat menyimpan satu kop surat aktif.
- Format yang diterima: PDF atau PNG.
- Kop surat dapat dihapus dan diganti.

## Acceptance Criteria

- Nomor baris nilai bertambah otomatis saat mata kuliah ditambahkan.
- Total SKS, total bobot, dan IPS tampil benar di KHS mahasiswa.
- Data nilai berubah ketika staf/admin memperbarui master mata kuliah terkait.
- Cetak KHS menyembunyikan hamburger menu, notifikasi, dan tombol keluar.
