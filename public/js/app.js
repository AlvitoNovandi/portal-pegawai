const fileInput = document.getElementById('berkas');

    reader.readAsDataURL(file);
  } else {
    previewImage.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="60" font-size="60">📄</text></svg>';
  }
}

removeFile.addEventListener('click', () => {
  fileInput.value = '';
  preview.classList.remove('show');
});

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';

  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

submitBtn.addEventListener('click', async () => {
  const nama = document.getElementById('nama').value.trim();
  const email = document.getElementById('email').value.trim();
  const file = fileInput.files[0];

  if (!nama || !email || !file) {
    showAlert('error', 'Semua field wajib diisi.');
    return;
  }

  setLoading(true);
  hideAlert();

  try {
    const formData = new FormData();

    formData.append('nama', nama);
    formData.append('email', email);
    formData.append('berkas', file);

    const response = await fetch('/daftar', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      showAlert(
        'success',
        `Pendaftaran berhasil untuk ${result.data.nama}`
      );

      document.getElementById('nama').value = '';
      document.getElementById('email').value = '';

      fileInput.value = '';
      preview.classList.remove('show');

    } else {
      showAlert('error', result.message);
    }

  } catch (err) {
    showAlert('error', 'Gagal terhubung ke server.');
  }

  setLoading(false);
});

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;

  loader.style.display = isLoading ? 'block' : 'none';

  submitText.textContent = isLoading
    ? 'Sedang Memproses...'
    : 'Kirim Pendaftaran';
}

function showAlert(type, message) {
  alertBox.className = `alert ${type}`;
  alertBox.textContent = message;
}

function hideAlert() {
  alertBox.className = 'alert';
  alertBox.textContent = '';
}