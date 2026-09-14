const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { badRequest } = require('../utils/errors');

// ponytail: local disk storage, good enough for a single dev/staging instance.
// On a host with an ephemeral or non-shared filesystem (Render included) these
// files vanish on every restart/redeploy and aren't visible across instances -
// swap the storage engine for an object store (S3, Cloudinary, R2, ...) before
// relying on uploads surviving in that kind of production environment.

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function ensureUploadDir(subdir) {
  const dir = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// One multer instance per subdirectory (categories/quizzes/avatars), each
// expecting a single multipart field named "image".
function createImageUploader(subdir) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, ensureUploadDir(subdir)),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  });

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return cb(badRequest('Only JPEG, PNG, WEBP, or GIF images are allowed'));
      }

      cb(null, true);
    },
  }).single('image');
}

function publicUrlFor(subdir, filename) {
  return `/uploads/${subdir}/${filename}`;
}

// Best-effort cleanup of the file a new upload replaces; a missing/already-gone
// file isn't worth surfacing as an error.
function deleteUploadedFile(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) {
    return;
  }

  fs.unlink(path.join(UPLOAD_ROOT, publicUrl.replace('/uploads/', '')), () => {});
}

module.exports = {
  UPLOAD_ROOT,
  MAX_FILE_SIZE_BYTES,
  createImageUploader,
  publicUrlFor,
  deleteUploadedFile,
};
