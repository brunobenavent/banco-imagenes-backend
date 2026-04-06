// src/services/cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import config from '../config/index.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true
});

// Transformation presets
export const TRANSFORMATIONS = {
  real: {}, // Original - no transformation
  medium: { width: 800, crop: 'scale', quality: 'auto' },
  small: { width: 400, crop: 'scale', quality: 'auto' }
};

export const FOLDER = 'banco-imagenes';

/**
 * Upload image to Cloudinary
 * @param {Buffer} fileBuffer - Image buffer
 * @param {string} publicId - Custom public ID
 * @returns {Promise<Object>} - Upload result
 */
export async function uploadImage(fileBuffer, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        public_id: publicId,
        resource_type: 'image',
        format: 'jpg'
      },
      (error, result) => {
        if (error) {
          console.error('[CloudinaryService] Error uploading:', error.message);
          return reject(error);
        }
        resolve(result);
      }
    ).end(fileBuffer);
  });
}

/**
 * Get URL for image with specific size
 * @param {string} publicId - Cloudinary public ID
 * @param {string} size - Size: 'real', 'medium', or 'small'
 * @returns {string} - Transformed URL
 */
export function getUrl(publicId, size = 'real') {
  const transformation = TRANSFORMATIONS[size] || TRANSFORMATIONS.real;
  
  return cloudinary.url(publicId, {
    ...transformation,
    secure: true,
    format: 'jpg'
  });
}

/**
 * Get signed URL for secure downloads
 * @param {string} publicId - Cloudinary public ID
 * @param {string} size - Size: 'real', 'medium', or 'small'
 * @returns {string} - Signed URL
 */
export function getSignedUrl(publicId, size = 'real') {
  const transformation = TRANSFORMATIONS[size] || TRANSFORMATIONS.real;
  
  return cloudinary.url(publicId, {
    ...transformation,
    secure: true,
    sign_url: true,
    format: 'jpg'
  });
}

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} - Delete result
 */
export async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('[CloudinaryService] Error deleting:', error.message);
    throw error;
  }
}

/**
 * Check if image exists in Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<boolean>}
 */
export async function imageExists(publicId) {
  try {
    await cloudinary.api.resource(publicId);
    return true;
  } catch (error) {
    return false;
  }
}
