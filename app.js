// ============================================================
//  FILE: app.js  —  Server Utama Aplikasi Portal Pegawai
//  TECH STACK: Node.js + Express
//  CLOUD: Azure Blob Storage + Azure Database for MySQL
// ============================================================

// ─── BAGIAN 1: LOAD ENVIRONMENT VARIABLES ───────────────────
// Perintah ini WAJIB ada di baris paling atas.
// dotenv membaca file .env dan memasukkan semua nilai ke dalam
// process.env, sehingga bisa diakses di mana saja dalam kode.
// INGAT: Nilai .env TIDAK pernah ikut ke-commit ke GitHub!
require('dotenv').config();

// ─── BAGIAN 2: IMPORT LIBRARY ────────────────────────────────
const express = require('express');        // Framework web server
const multer  = require('multer');         // Middleware untuk handle upload file
const mysql   = require('mysql2/promise'); // Driver MySQL (versi Promise/async-await)
const { BlobServiceClient } = require('@azure/storage-blob'); // Azure SDK
const path    = require('path');           // Utilitas path file (built-in Node.js)
const { v4: uuidv4 } = require('uuid');   // Generator ID unik untuk nama file

// ─── BAGIAN 3: INISIALISASI APLIKASI ─────────────────────────
const app = express();

// ─── BAGIAN 4: KONFIGURASI MULTER (KUNCI KEAMANAN CLOUD!) ────
// PERHATIKAN: storage: multer.memoryStorage()
// Ini berarti file yang diunggah pengguna disimpan sementara
// di MEMORY (RAM) server, BUKAN ke disk lokal.
// Kenapa? Karena di Cloud (Container/Auto Scaling), kita
// DILARANG menyimpan file di disk server yang bisa mati kapan saja.
// File langsung kita teruskan ke Azure Blob Storage.
const upload = multer({
  storage: multer.memoryStorage(), // ← TIDAK ADA local disk!
  limits: {
    fileSize: 5 * 1024 * 1024, // Batas ukuran file: 5 MB
  },
  fileFilter: (req, file, cb) => {
    // Hanya izinkan file gambar dan PDF
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true); // Izinkan file
    } else {
      cb(new Error('Hanya file JPG, PNG, atau PDF yang diizinkan!'), false);
    }
  }
});

// ─── BAGIAN 5: MIDDLEWARE ─────────────────────────────────────
app.use(express.static('public')); // Sajikan file statis dari folder /public
app.use(express.json());           // Parsing request body format JSON
app.use(express.urlencoded({ extended: true })); // Parsing form biasa

// ─── BAGIAN 6: FUNGSI HELPER — Upload ke Azure Blob Storage ──
// Fungsi ini khusus menangani logika upload ke Azure.
// Dengan memisahkan ke fungsi sendiri, kode jadi lebih rapi (separation of concern).

async function uploadToAzureBlob(fileBuffer, originalName, mimeType) {
  // 6a. Buat koneksi ke Azure Blob Storage menggunakan Connection String dari .env
  //     BlobServiceClient adalah "pintu masuk" ke seluruh Storage Account kita
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );

  // 6b. Ambil referensi ke Container (folder) yang sudah kita buat di Azure
  //     Container ini harus sudah ada dan diset PUBLIC agar URL-nya bisa dibuka browser
  const containerClient = blobServiceClient.getContainerClient(
    process.env.AZURE_STORAGE_CONTAINER_NAME
  );

  // 6c. Buat nama file yang UNIK menggunakan UUID
  //     Kenapa perlu unik? Agar tidak ada dua file dengan nama sama yang saling menimpa!
  //     Contoh hasil: "a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg"
  const fileExtension = path.extname(originalName); // Ambil ekstensi, misal: ".jpg"
  const uniqueBlobName = `${uuidv4()}${fileExtension}`;

  // 6d. Buat referensi ke "slot" file spesifik di dalam container (disebut "Block Blob")
  const blockBlobClient = containerClient.getBlockBlobClient(uniqueBlobName);

  // 6e. Lakukan upload file dari buffer (RAM) ke Azure
  //     uploadData() menerima Buffer — ini yang dari multer.memoryStorage()
  await blockBlobClient.uploadData(fileBuffer, {
    blobHTTPHeaders: {
      blobContentType: mimeType // Penting: set MIME type agar browser tahu cara membuka file
    }
  });

  // 6f. Kembalikan URL publik file yang baru saja diunggah
  //     Format URL Azure Blob: https://<account>.blob.core.windows.net/<container>/<filename>
  return blockBlobClient.url;
}

// ─── BAGIAN 7: FUNGSI HELPER — Simpan ke Database MySQL ──────
async function saveToDatabase(nama, email, ktpUrl) {
  // 7a. Buat koneksi ke Azure Database for MySQL menggunakan nilai dari .env
  //     ssl: { rejectUnauthorized: false } diperlukan untuk Azure MySQL
  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      // Azure MySQL membutuhkan koneksi SSL untuk keamanan
      rejectUnauthorized: false
    }
  });

  // 7b. Jalankan perintah INSERT dengan "Prepared Statement"
  //     Tanda tanya (?) adalah placeholder — JANGAN pernah langsung memasukkan
  //     nilai user ke query! Ini mencegah serangan SQL Injection.
  const [result] = await connection.execute(
    'INSERT INTO pelamar (nama, email, ktp_url) VALUES (?, ?, ?)',
    [nama, email, ktpUrl] // Nilai asli dimasukkan secara terpisah, bukan di query string
  );

  // 7c. Tutup koneksi setelah selesai — jangan biarkan koneksi menggantung!
  await connection.end();

  // 7d. Kembalikan ID record yang baru dibuat (berguna untuk konfirmasi)
  return result.insertId;
}

// ─── BAGIAN 8: ROUTE — Halaman Utama ─────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── BAGIAN 9: ROUTE — Submit Pendaftaran (INTI APLIKASI) ────
// Endpoint ini menerima POST request dari form HTML
// upload.single('berkas') → middleware multer menangkap file dari field bernama 'berkas'

app.post('/daftar', upload.single('berkas'), async (req, res) => {
  try {
    // 9a. Ambil data teks dari body request
    const { nama, email } = req.body;

    // 9b. Ambil data file dari multer (tersimpan di memory/RAM, bukan disk!)
    const file = req.req ? req.req.file : req.file; // Ambil file dengan aman

    // Validasi: pastikan semua field terisi
    if (!nama || !email || !req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nama, email, dan file wajib diisi!'
      });
    }

    console.log(`[INFO] Pendaftaran baru: ${nama} (${email})`);
    console.log(`[INFO] File: ${req.file.originalname} (${req.file.size} bytes)`);

    // ─────────────────────────────────────────────────────────
    //  LANGKAH 1: Upload file ke Azure Blob Storage
    //  Kita memanggil fungsi helper yang sudah kita buat di atas
    // ─────────────────────────────────────────────────────────
    console.log('[INFO] Mengupload file ke Azure Blob Storage...');
    const fileUrl = await uploadToAzureBlob(
      req.file.buffer,       // Buffer file dari RAM (bukan path disk!)
      req.file.originalname, // Nama asli file untuk ambil ekstensinya
      req.file.mimetype      // Tipe MIME file (image/jpeg, dll)
    );
    console.log(`[SUCCESS] File terupload ke: ${fileUrl}`);

    // ─────────────────────────────────────────────────────────
    //  LANGKAH 2: Simpan data teks + URL ke Database
    //  URL dari Azure Blob yang baru kita dapat, disimpan di DB
    // ─────────────────────────────────────────────────────────
    console.log('[INFO] Menyimpan data ke Azure MySQL Database...');
    const newId = await saveToDatabase(nama, email, fileUrl);
    console.log(`[SUCCESS] Data tersimpan dengan ID: ${newId}`);

    // 9c. Kirim respons sukses ke frontend
    res.status(201).json({
      success: true,
      message: `Pendaftaran berhasil! Data ${nama} telah tersimpan.`,
      data: {
        id: newId,
        nama: nama,
        email: email,
        ktp_url: fileUrl // URL publik Azure Blob yang bisa dibuka di browser
      }
    });

  } catch (error) {
    // Tangani berbagai jenis error
    console.error('[ERROR]', error.message);

    // Error dari multer (file terlalu besar, tipe tidak valid)
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File terlalu besar! Maksimal 5 MB.' });
    }

    // Error duplikat email di database
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar sebelumnya!' });
    }

    // Error umum lainnya
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server. Cek log untuk detail.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ─── BAGIAN 10: ROUTE — Cek Kesehatan Server (Health Check) ──
// Berguna untuk memastikan server berjalan normal
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: {
      db_host: process.env.DB_HOST ? '✅ Terkonfigurasi' : '❌ BELUM DIISI',
      azure_storage: process.env.AZURE_STORAGE_CONNECTION_STRING ? '✅ Terkonfigurasi' : '❌ BELUM DIISI',
      container: process.env.AZURE_STORAGE_CONTAINER_NAME ? '✅ Terkonfigurasi' : '❌ BELUM DIISI',
    }
  });
});

// ─── BAGIAN 11: JALANKAN SERVER ───────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('============================================');
  console.log(`  🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`  📊 Health check: http://localhost:${PORT}/health`);
  console.log('============================================');
  console.log('  Konfigurasi Aktif:');
  console.log(`  DB Host  : ${process.env.DB_HOST || '❌ BELUM DIISI'}`);
  console.log(`  Azure    : ${process.env.AZURE_STORAGE_CONNECTION_STRING ? '✅ OK' : '❌ BELUM DIISI'}`);
  console.log(`  Container: ${process.env.AZURE_STORAGE_CONTAINER_NAME || '❌ BELUM DIISI'}`);
  console.log('============================================');
});
