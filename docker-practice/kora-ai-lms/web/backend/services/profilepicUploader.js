// services/profilePicUploader.js
import cloudinary from '../config/cloudinary.js';
import mime from 'mime-types';
import { sanitize } from '../utils/sanitize.js';
import s3 from '../config/s3-storage.js';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
/**
 * Uploads profile picture to Cloudinary at
 *   folder: /<userEmail>/
 *   public_id: profilePic
 * Overwrites previous profile picture for this user.
 * Only allows image formats.
 */
export function uploadProfilePicToCloudinary({ buffer, mimetype, userEmail }) {
  // Validate that it's an image
  if (!mimetype?.startsWith('image/')) {
    throw new Error('Only image files are allowed for profile pictures');
  }

  const resource_type = 'image'; // Always image for profile pics
  const folder = sanitize(userEmail);
  const public_id = 'profilePic';

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id,
        resource_type,
        overwrite: true,         // replace older profile pic
        invalidate: true,        // invalidate cached CDN version
        use_filename: false,
        unique_filename: false,
        transformation: [
          { width: 500, height: 500, crop: 'fill', gravity: 'face' }, // Square crop focused on face
          { quality: 'auto', fetch_format: 'auto' } // Optimize format and quality
        ]
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export async function uploadProfilePicToS3({ buffer, mimetype, userEmail }) {
  // Validate image
  if (!mimetype?.startsWith('image/')) {
    throw new Error('Only image files are allowed for profile pictures');
  }

  // Sanitise email to create a folder name
  const folder = sanitize(userEmail);
  const extension = mime.extension(mimetype) || 'jpg'; // fallback to jpg

  // Process the image with Sharp: resize to 500x500 cover (crop to centre)
  const processedBuffer = await sharp(buffer)
    .resize(500, 500, {
      fit: 'cover',      // covers the area, cropping if necessary
      position: 'center' // centre gravity (no face detection)
    })
    .toFormat(extension === 'jpg' ? 'jpeg' : extension, { quality: 85 })
    .toBuffer();

  const key = `${folder}/profilePic.${extension}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: processedBuffer,
    ContentType: mimetype,
  });

  try {
    await s3.send(command);

    // Build the public URL (assumes bucket is publicly readable)
    const region = process.env.AWS_REGION;
    const bucket = process.env.AWS_S3_BUCKET;
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    console.log('url', url);
    // Return a structure similar to Cloudinary's response
    return {
      secure_url: url,
      public_id: key,
      width: 500,
      height: 500,
      format: extension,
    };
  } catch (err) {
    throw new Error(`S3 upload failed: ${err.message}`);
  }
}
