import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import cloudinary from "../config/cloudinary.js";
import { sanitize } from "../utils/sanitize.js";
import s3 from "../config/s3-storage.js";

/**
 * Upload audio file to Cloudinary
 * 
 * @param {Buffer} fileBuffer - The audio file buffer
 * @param {string} mimetype - The MIME type of the file
 * @param {string} email - User's email for folder organization
 * @param {string} classNameKey - Class name for folder organization
 * @param {string} lectureId - The lecture ID
 * @param {string} lectureTitle - The lecture title
 * @returns {Promise<Object>} Cloudinary upload result with secure_url, public_id, etc.
 */
export const uploadAudioToCloudinary = async (fileBuffer, mimetype, email, classNameKey, lectureId, lectureTitle) => {
    // 'raw' resource type is used for non-image files like audio
    const resource_type = 'video';

    // Sanitize the email and class name for safe folder names
    const sanitizedEmail = sanitize(email);
    const sanitizedClassName = sanitize(classNameKey);
    const folder = `${sanitizedEmail}/${sanitizedClassName}`;

    // Use a unique public_id with a timestamp for each upload
    const public_id = `lecture-${lectureId}-${sanitize(lectureTitle)}-${new Date().getTime()}`;

    console.log(`[Cloudinary] Uploading audio to folder: ${folder}, public_id: ${public_id}`);

    return new Promise((resolve, reject) => {
        // Create the upload stream to Cloudinary
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,             // Define the folder structure
                public_id,          // Define the public ID
                resource_type,      // 'raw' for audio
                overwrite: true,    // Overwrite existing file with the same public_id
                invalidate: true,   // Invalidate cached CDN version
                use_filename: false, // Don't use original filename for security reasons
                unique_filename: false, // Use the provided public_id
            },
            (err, result) => {
                if (err) {
                    console.error('[Cloudinary] Upload failed:', err.message);
                    return reject(err);
                }
                console.log(`[Cloudinary] Upload successful: ${result.secure_url}`);
                console.log(`[Cloudinary] Asset ID: ${result.asset_id}, Public ID: ${result.public_id}`);
                // Return the result (including secure_url and other metadata)
                resolve(result);
            }
        );

        // Since Cloudinary's upload_stream expects a stream, use fileBuffer directly
        // Buffer is a streamable data type, so we can pipe it directly to the upload_stream
        stream.end(fileBuffer);
    });
};

export const uploadAudioToS3 = async (fileBuffer, mimetype, email, classNameKey, lectureId, lectureTitle) => {
    try {
        // Folder aur File Name sanitize karna
        const sanitizedEmail = sanitize(email);
        const sanitizedClassName = sanitize(classNameKey);
        const folder = `${sanitizedEmail}/${sanitizedClassName}`;

        // Extension nikalna (e.g., audio/wav -> wav)
        const extension = mimetype.split('/')[1] || 'wav';

        // Unique Public ID (Key) banana
        const public_id = `lecture-${lectureId}-${sanitize(lectureTitle)}-${Date.now()}.${extension}`;

        // S3 Key (Path)
        const key = `${folder}/${public_id}`;

        console.log(`[S3] Uploading audio to: ${key}`);

        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
            Body: fileBuffer,
            ContentType: mimetype,
            // CacheControl: 'max-age=31536000', // Optional: Browser caching ke liye
        };

        const command = new PutObjectCommand(params);
        await s3.send(command);

        // Public URL build karna
        const region = process.env.AWS_REGION;
        const bucket = process.env.AWS_S3_BUCKET;
        const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

        console.log(`[S3] Upload successful: ${url}`);

        // Cloudinary jaisa return object taake baki code na badalna paray
        return {
            secure_url: url,
            public_id: key,
            asset_id: public_id, // Mapping S3 Key to asset_id for compatibility
            resource_type: 'video', // Audio context mein 'video' hi use hota tha
        };

    } catch (err) {
        console.error('[S3] Upload failed:', err.message);
        throw err;
    }
};
/**
 * Delete audio file from Cloudinary
 * 
 * @param {string} publicId - The public ID of the file to delete
 * @returns {Promise<Object>} Cloudinary deletion result
 */
export const deleteAudioFromCloudinary = async (publicId) => {
    try {
        console.log(`[Cloudinary] Deleting audio with public_id: ${publicId}`);
        const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        console.log(`[Cloudinary] Deletion result:`, result);
        return result;
    } catch (error) {
        console.error('[Cloudinary] Deletion failed:', error.message);
        throw error;
    }
};

export const deleteAudioFromS3 = async (key) => {
    try {
        // S3 mein publicId ko hi 'Key' kaha jata hai (e.g., 'user@email.com/class/lecture.wav')
        console.log(`[S3] Deleting audio with Key: ${key}`);

        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key, // Ye wahi string hai jo aapne database mein save ki thi
        };

        const command = new DeleteObjectCommand(params);
        const result = await s3.send(command);

        console.log(`[S3] Deletion successful for Key: ${key}`);

        // Cloudinary jaisa response structure taake baki logic break na ho
        return { result: 'ok', details: result };
    } catch (error) {
        console.error('[S3] Deletion failed:', error.message);
        throw error;
    }
};

export const uploadDocumentToS3 = async (fileBuffer, mimetype, originalName, email, classNameKey, lectureId, lectureTitle) => {
    try {
        const sanitizedEmail = sanitize(email);
        const sanitizedClassName = sanitize(classNameKey);
        const folder = `${sanitizedEmail}/${sanitizedClassName}/documents`;

        let extension = 'bin';
        if (originalName && originalName.includes('.')) {
            extension = originalName.split('.').pop().toLowerCase();
        }

        const public_id = `doc-${lectureId}-${sanitize(lectureTitle)}-${Date.now()}.${extension}`;
        const key = `${folder}/${public_id}`;

        console.log(`[S3] Uploading document to: ${key}`);

        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
            Body: fileBuffer,
            ContentType: mimetype,
            ContentDisposition: `inline; filename="${originalName}"`
        };

        const command = new PutObjectCommand(params);
        await s3.send(command);

        const region = process.env.AWS_REGION;
        const bucket = process.env.AWS_S3_BUCKET;
        const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

        console.log(`[S3] Upload successful: ${url}`);

        return {
            secure_url: url,
            public_id: key,
            asset_id: public_id,
            resource_type: 'raw',
            extension,
            mimeType: mimetype,
            sizeBytes: fileBuffer.length,
            originalName
        };

    } catch (err) {
        console.error('[S3] Document upload failed:', err.message);
        throw err;
    }
};