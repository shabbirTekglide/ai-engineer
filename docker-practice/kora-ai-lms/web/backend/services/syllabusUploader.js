// services/syllabusUploader.js
import cloudinary from '../config/cloudinary.js';
import mime from 'mime-types';
import { sanitize } from '../utils/sanitize.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3-storage.js';

/**
 * Decide Cloudinary resource_type based on mimetype.
 * - images -> "image"
 * - everything else (pdf/doc/docx) -> "raw"
 */
function resourceTypeFor(mimetype) {
  if (mimetype?.startsWith('image/')) return 'image';
  return 'raw';
}

/**
 * Uploads the file buffer to Cloudinary at
 *   folder:  /<username>/<classId>/
 *   public_id: syllabus
 * Overwrites previous syllabus.
 */
export function uploadSyllabusToCloudinary({ buffer, mimetype, userEmail, className }) {
  const resource_type = resourceTypeFor(mimetype);
  const folder = `${sanitize(userEmail)}/${sanitize(className)}`;
  const public_id = 'syllabus';

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id,
        resource_type,
        overwrite: true,         // replace older syllabus for this class
        invalidate: true,        // invalidate cached CDN version
        use_filename: false,
        unique_filename: false,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result); // result.secure_url, public_id, version, etc.
      }
    );
    stream.end(buffer);
  });
}
export async function uploadSyllabusToS3({ buffer, mimetype, userEmail, className }) {
  try {
    // Cloudinary ki tarah folder structure banana
    const folder = `${sanitize(userEmail)}/${sanitize(className)}`;

    // Extension nikalna (e.g., .pdf, .docx)
    const extension = mimetype.split('/')[1] || 'pdf';

    // Key (S3 path): Syllabus hamesha replace hoga kyunki filename constant hai
    const key = `${folder}/syllabus.${extension}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      // Agar client ne ACLs enable kiye hain toh niche wali line uncomment karein:
      // ACL: 'public-read', 
    });

    await s3.send(command);

    // Public URL Build karna
    const region = process.env.AWS_REGION;
    const bucket = process.env.AWS_S3_BUCKET;
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    // Cloudinary jaisa response format return karna
    return {
      secure_url: url,
      public_id: key,
      format: extension,
      resource_type: mimetype.startsWith('image/') ? 'image' : 'raw',
    };

  } catch (err) {
    console.error("S3 Syllabus Upload Error:", err);
    throw new Error(`S3 upload failed: ${err.message}`);
  }
}