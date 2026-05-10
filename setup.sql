-- ============================================================
--  FILE: setup.sql
--  TUJUAN: Membuat database dan tabel yang dibutuhkan aplikasi
--  CARA PAKAI: Jalankan perintah ini di DBeaver / TablePlus /
--              MySQL Workbench setelah terhubung ke Azure DB
-- ============================================================

-- LANGKAH 1: Buat database baru (jika belum ada)
CREATE DATABASE IF NOT EXISTS portal_pegawai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- LANGKAH 2: Pilih database yang baru dibuat
USE portal_pegawai;

-- LANGKAH 3: Buat tabel pelamar
-- Penjelasan setiap kolom:
--   id       -> Primary key, otomatis bertambah (1, 2, 3, ...)
--   nama     -> Nama lengkap pelamar (teks, max 100 karakter)
--   email    -> Alamat email pelamar (teks, max 150 karakter)
--   ktp_url  -> URL publik file yang tersimpan di Azure Blob Storage
--   created_at -> Waktu pendaftaran (otomatis diisi oleh MySQL)

CREATE TABLE IF NOT EXISTS pelamar (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  nama       VARCHAR(100)  NOT NULL,
  email      VARCHAR(150)  NOT NULL UNIQUE,
  ktp_url    TEXT          NOT NULL,
  created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- LANGKAH 4: Verifikasi tabel sudah dibuat dengan benar
DESCRIBE pelamar;

-- UNTUK MELIHAT SEMUA DATA SETELAH PENGUJIAN:
-- SELECT * FROM pelamar;
