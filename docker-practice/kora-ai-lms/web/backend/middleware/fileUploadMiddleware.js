// middleware/uploadMemory.js
import multer from 'multer';

function wrapMulter(uploader) {
  return {
    single: (fieldName) => {
      return (req, res, next) => {
        uploader.single(fieldName)(req, res, (err) => {
          if (!err) return next();

          // ❌ Wrong file type
          if (err.message?.includes("Only") || err.message?.includes("Allowed formats")) {
            return res.status(400).json({
              success: false,
              message: err.message,
            });
          }

          // ❌ File too large
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
              success: false,
              message: "File size is too large.",
            });
          }

          // ❌ Unexpected error
          return res.status(400).json({
            success: false,
            message: "File upload failed.",
          });
        });
      };
    },
  };
}

const allowed = new Set([
  'application/pdf',
  // 'application/msword',
  // 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const allowedDocumentMimeTypes = [
  'application/pdf', // PDF
  'application/msword', // DOC
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
  'text/plain', // TXT
];

const imageAllowed = new Set([
  'image/jpeg',
  'image/png',
  'image/jpg',
]);
const audioFileFilter = (req, file, cb) => {
  const allowedAudioTypes = [
    'audio/mpeg', // MP3
    'audio/wav', // WAV
    'audio/ogg', // OGG
    'audio/aac', // AAC
    'audio/flac', // FLAC
    'audio/webm', // WebM audio
    'audio/x-m4a', // M4A
    'audio/mp4', // MP4 audio
    'audio/x-ms-wma', // WMA
    // Add video types that contain audio
    'video/mp4',
    'video/mpeg',
    'video/ogg',
    'video/webm',
    'video/x-msvideo', // AVI
    'video/quicktime', // MOV
    'video/x-matroska', // MKV
  ];

  // Also check file extensions as fallback
  const allowedExtensions = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.webm', '.m4a', '.mp4', '.wma', '.avi', '.mov', '.mkv'];
  const fileExtension = '.' + file.originalname.split('.').pop().toLowerCase();

  if (allowedAudioTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Allowed formats: MP3, WAV, OGG, AAC, FLAC, WebM, M4A, MP4, WMA, AVI, MOV, MKV'), false);
  }
};


const fileFilter = (req, file, cb) => {
  if (!allowed.has(file.mimetype)) {
    return cb(new Error('Only PDF, JPEG, PNG are allowed.'));
  }
  cb(null, true);
};

const documentFilter = (req, file, cb) => {
  const allowedExtensions = ['.pdf', '.doc', '.docx', '.pptx', '.txt'];
  const fileExtension = '.' + file.originalname.split('.').pop().toLowerCase();

  if (allowedDocumentMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Allowed formats: PDF, DOC, DOCX, PPTX, TXT'), false);
  }
};

const spreadsheetFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  const fileExtension = '.' + file.originalname.split('.').pop().toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) || ['.csv', '.xlsx'].includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Allowed formats: CSV, XLSX'), false);
  }
};

const imageFilter = (req, file, cb) => {
  console.log(file.mimetype, "file mim type")
  if (!imageAllowed.has(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, JPG types are allowed.'));
  }
  cb(null, true);
};

// Default to 15MB to support 10MB syllabus files with overhead
const maxBytes = Number(process.env.UPLOAD_MAX_MB || 15) * 1024 * 1024;

// For audio/video files: default 250MB to match nginx client_max_body_size (set AUDIO_UPLOAD_MAX_MB if nginx is higher)
const maxAudioBytes = Number(process.env.AUDIO_UPLOAD_MAX_MB || 250) * 1024 * 1024;

export const memoryUpload = wrapMulter(multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: maxBytes },
}))

export const imageUpload = wrapMulter(multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: maxBytes },
}))

export const audioUpload = wrapMulter(multer({
  storage: multer.memoryStorage(),
  fileFilter: audioFileFilter,
  limits: {
    fileSize: maxAudioBytes,
    fieldSize: maxAudioBytes // Also increase field size limit
  },
}))

export const documentUpload = wrapMulter(multer({
  storage: multer.memoryStorage(),
  fileFilter: documentFilter,
  limits: {
    fileSize: maxBytes,
    fieldSize: maxBytes // Also increase field size limit
  },
}))

export const spreadsheetUpload = wrapMulter(multer({
  storage: multer.memoryStorage(),
  fileFilter: spreadsheetFilter,
  limits: {
    fileSize: maxBytes,
    fieldSize: maxBytes
  },
}))
