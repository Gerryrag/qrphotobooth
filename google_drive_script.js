/**
 * GOOGLE APPS SCRIPT - AUTO UPLOAD & DATABASE DI GOOGLE DRIVE (VERCEL READY)
 * 
 * Script ini berfungsi ganda:
 * 1. Menyimpan file foto tamu ke folder Google Drive Anda.
 * 2. Menyimpan daftar ucapan & data tamu ke file "photos.json" di dalam folder tersebut,
 *    sehingga aplikasi di Vercel tidak butuh database terpisah (100% Gratis & Awet).
 * 
 * CARA UPDATE DI SCRIPT.GOOGLE.COM:
 * 1. Buka project Anda di https://script.google.com
 * 2. Ganti seluruh kodenya dengan kode di bawah ini.
 * 3. Pastikan FOLDER_ID sudah terisi ID folder Anda (tanpa '?usp=...').
 * 4. Klik icon Save (disket).
 * 5. Klik "Deploy" -> "Manage deployments" -> Klik icon Pensil (Edit)
 *    -> Version: pilih "New version" -> Klik "Deploy".
 */

// GANTI DENGAN ID FOLDER GOOGLE DRIVE ANDA
var FOLDER_ID = "1jMuRoj5BAoWbhggEZCbIgMDJI5Ysqv4T";

// POST: Upload Foto Baru & Catat Ucapan Tamu
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var cleanFolderId = FOLDER_ID.split('?')[0].split('#')[0].trim();
    var folder = DriveApp.getFolderById(cleanFolderId);

    // 1. Simpan Foto JPG
    var base64Data = data.image_base64.replace(/^data:image\/\w+;base64,/, "");
    var decoded = Utilities.base64Decode(base64Data);
    var filename = data.filename || ("wedding_" + new Date().getTime() + ".jpg");

    var blob = Utilities.newBlob(decoded, "image/jpeg", filename);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    var imageUrl = "https://lh3.googleusercontent.com/d/" + fileId;

    // 2. Simpan Catatan Ucapan Tamu ke photos.json di Folder Drive
    var photoEntry = {
      id: new Date().getTime(),
      guest_name: data.guest_name ? String(data.guest_name).trim() : "Tamu Undangan",
      message: data.message ? String(data.message).trim() : "",
      image_url: imageUrl,
      created_at: new Date().toISOString()
    };

    var files = folder.getFilesByName("photos.json");
    var photoList = [];
    var jsonFile;

    if (files.hasNext()) {
      jsonFile = files.next();
      try {
        photoList = JSON.parse(jsonFile.getBlob().getDataAsString());
      } catch (parseErr) {
        photoList = [];
      }
    }

    photoList.unshift(photoEntry);
    if (photoList.length > 100) photoList = photoList.slice(0, 100);

    if (jsonFile) {
      jsonFile.setContent(JSON.stringify(photoList));
    } else {
      var newJsonFile = folder.createFile("photos.json", JSON.stringify(photoList), "application/json");
      newJsonFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: fileId,
      imageUrl: imageUrl,
      data: photoEntry
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// GET: Ambil Daftar Seluruh Foto Tamu dari photos.json
function doGet(e) {
  try {
    var cleanFolderId = FOLDER_ID.split('?')[0].split('#')[0].trim();
    var folder = DriveApp.getFolderById(cleanFolderId);
    var files = folder.getFilesByName("photos.json");

    if (files.hasNext()) {
      var content = files.next().getBlob().getDataAsString();
      return ContentService.createTextOutput(content)
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  }
}
