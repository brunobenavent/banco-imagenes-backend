// script/upload-basic.js
// Script para subir imágenes SIN validar en Dantia
// Usa el endpoint /api/images/upload-basic
// Después se puede usar enrich-images.js para agregar info de Dantia

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const API_URL = 'http://localhost:3000/api';
const IMAGES_DIR = path.join(__dirname, '..', 'img_estudio');

// Configuración
const USERNAME = 'brunobenavent@gmail.com';
const PASSWORD = 'admin123';
const MAX_RETRIES = 3;
const BASE_DELAY = 300; // ms entre requests
const RETRY_DELAY = 1500; // ms antes de reintentar
const MIN_FILE_SIZE = 1000; // mínimo 1KB (archivos menores se skippean)

async function login() {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: USERNAME,
      password: PASSWORD
    });
    return response.data.token;
  } catch (error) {
    console.error('Error login:', error.response?.data || error.message);
    throw error;
  }
}

function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size;
}

async function uploadImage(token, imagePath, articleCode, retries = MAX_RETRIES) {
  const axiosConfig = {
    timeout: 30000,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const formData = new FormData();
      formData.append('image', fs.createReadStream(imagePath));
      formData.append('code', articleCode);

      const response = await axios.post(`${API_URL}/images/upload-basic`, formData, {
        ...axiosConfig,
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      const status = error.response?.status;
      const serverMessage = error.response?.data?.message || error.message;
      const isSocketError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || 
                            error.message.includes('socket hang up') || error.code === 'ECONNABORTED';
      
      if (attempt === retries) {
        let finalMessage = serverMessage;
        
        if (isSocketError) {
          finalMessage = `Connection error (tried ${retries} times)`;
        } else if (status === 409) {
          finalMessage = 'Already exists (duplicate)';
        }
        
        return { success: false, error: finalMessage };
      }
      
      // Si es error 409 (duplicado), no reintentar
      if (status === 409) {
        return { success: false, error: 'Already exists (duplicate)' };
      }
      
      // Esperar antes de reintentar
      const delay = RETRY_DELAY * attempt;
      process.stdout.write(`\n   ↻ Retrying in ${delay/1000}s (attempt ${attempt}/${retries})... `);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return { success: false, error: 'Max retries exceeded' };
}

function extractArticleCode(filename) {
  const name = path.parse(filename).name;
  const match = name.match(/^(\d{6})/);
  return match ? match[1] : null;
}

async function main() {
  console.log('🚀 Starting BASIC image upload (no Dantia validation)...');
  console.log(`   Min file size: ${MIN_FILE_SIZE} bytes\n`);
  
  // Login
  console.log('1. Authenticating...');
  const token = await login();
  console.log('   ✓ Logged in successfully\n');
  
  // Get all image files with their sizes
  const allFiles = fs.readdirSync(IMAGES_DIR)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .map(f => ({
      filename: f,
      filePath: path.join(IMAGES_DIR, f),
      size: getFileSize(path.join(IMAGES_DIR, f))
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
  
  // Separate valid and invalid files
  const validFiles = allFiles.filter(f => f.size >= MIN_FILE_SIZE);
  const invalidFiles = allFiles.filter(f => f.size < MIN_FILE_SIZE);
  
  console.log(`2. Found ${allFiles.length} files total:`);
  console.log(`   - ${validFiles.length} valid (will upload)`);
  console.log(`   - ${invalidFiles.length} invalid (too small/empty - will skip)`);
  
  if (invalidFiles.length > 0) {
    console.log('\n   ⚠️  Invalid files:');
    invalidFiles.forEach(f => console.log(`      - ${f.filename} (${f.size} bytes)`));
  }
  console.log();
  
  const results = {
    uploaded: [],
    skipped: [],
    errors: []
  };
  
  let dynamicDelay = BASE_DELAY;
  
  for (let i = 0; i < validFiles.length; i++) {
    const { filename, filePath, size } = validFiles[i];
    const articleCode = extractArticleCode(filename);
    
    const progress = `[${i + 1}/${validFiles.length}]`;
    
    if (!articleCode) {
      console.log(`${progress} ⚠️  SKIP "${filename}" - no valid 6-digit code`);
      results.skipped.push(filename);
      continue;
    }
    
    process.stdout.write(`${progress} Uploading "${filename}" (${(size/1024).toFixed(0)}KB, code: ${articleCode})... `);
    
    const result = await uploadImage(token, filePath, articleCode);
    
    if (result.success) {
      console.log('✓');
      results.uploaded.push({ filename, articleCode });
      dynamicDelay = BASE_DELAY; // Reset delay after success
    } else {
      if (result.error.includes('Already exists') || result.error.includes('duplicate')) {
        console.log('⚠️ (already exists)');
        results.skipped.push(filename);
      } else {
        console.log(`✗ - ${result.error}`);
        results.errors.push({ filename, error: result.error });
        
        // Aumentar delay si hay errores
        dynamicDelay = Math.min(dynamicDelay * 1.5, 3000);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, dynamicDelay));
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`✓ Uploaded:  ${results.uploaded.length}`);
  console.log(`⚠️  Skipped:  ${results.skipped.length} (${invalidFiles.length} empty/small + ${results.skipped.length - invalidFiles.length} duplicates)`);
  console.log(`✗ Errors:   ${results.errors.length}`);
  
  if (results.errors.length > 0) {
    console.log('\n⚠️ Errors:');
    results.errors.forEach(e => console.log(`   - ${e.filename}: ${e.error}`));
  }
  
  // Guardar failed uploads
  if (results.errors.length > 0) {
    const failedPath = path.join(__dirname, 'failed_basic_uploads.json');
    fs.writeFileSync(failedPath, JSON.stringify(results.errors.map(e => e.filename), null, 2));
    console.log(`\n📝 Failed files saved to: ${failedPath}`);
  }
  
  console.log('\n✅ Done!');
  console.log('\n💡 Next step: Run enrich-images.js to add Dantia info to uploaded images');
}

main().catch(console.error);
