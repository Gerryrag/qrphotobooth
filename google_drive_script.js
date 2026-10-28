/**
 * GOOGLE APPS SCRIPT - AUTO UPLOAD FOTO KE GOOGLE DRIVE
 * 
 * PANDUAN CEPAT (2 MENIT):
 * 1. Buka Google Drive (https://drive.google.com).
 * 2. Buat folder baru (misal: "Foto Wedding Romeo & Juliet").
 * 3. Buka folder tersebut, lalu salin "Folder ID" dari bilah URL browser Anda:
 *    Contoh URL: https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i...
 *    Folder ID adalah: 1a2b3c4d5e6f7g8h9i...
 * 4. Buka https://script.google.com -> Klik "New Project".
 * 5. Hapus semua kode bawaan, lalu paste SELURUH kode di bawah ini.
 * 6. Ganti 'MASUKKAN_FOLDER_ID_ANDA_DI_SINI' dengan Folder ID Anda.
 * 7. Klik "Deploy" (di kanan atas) -> "New deployment".
 * 8. Pilih type: "Web app".
 * 9. Seting:
 *    - Execute as: "Me (email Anda)"
 *    - Who has access: "Anyone" (PENTING: pilih Anyone agar tamu bisa kirim foto).
 * 10. Klik "Deploy" -> Izinkan akses (Authorize Access) -> Salin "Web app URL".
 * 11. Masukkan URL tersebut ke file `.env` di proyek Anda:
 *     GOOGLE_DRIVE_WEBHOOK_URL="https://script.google.com/macros/s/.../exec"
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // GANTI DENGAN ID FOLDER GOOGLE DRIVE ANDA
    var FOLDER_ID = "MASUKKAN_FOLDER_ID_ANDA_DI_SINI";
    var folder = DriveApp.getFolderById(FOLDER_ID);

    // Ambil string base64 dan bersihkan prefix
    var base64Data = data.image_base64.replace(/^data:image\/\w+;base64,/, "");
    var decoded = Utilities.base64Decode(base64Data);
    var filename = data.filename || ("wedding_" + new Date().getTime() + ".jpg");

    // Buat file di Google Drive
    var blob = Utilities.newBlob(decoded, "image/jpeg", filename);
    var file = folder.createFile(blob);

    // Set permission agar foto bisa tampil langsung di galeri web
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // URL langsung untuk menampilkan gambar
    var fileId = file.getId();
    var imageUrl = "https://lh3.googleusercontent.com/d/" + fileId;

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: fileId,
      imageUrl: imageUrl,
      viewUrl: file.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
