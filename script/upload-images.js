// script/upload-images.js
// Script para subir imágenes desde la carpeta img_estudio
// Mejoras: reintentos automáticos, delays adaptativos, mejor manejo de errores

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
const BASE_DELAY = 500; // ms entre requests
const RETRY_DELAY = 2000; // ms antes de reintentar

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

async function uploadImage(token, imagePath, articleCode, retries = MAX_RETRIES) {
  // Configuración axios con timeout más largo
  const axiosConfig = {
    timeout: 30000, // 30 segundos timeout
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const formData = new FormData();
      formData.append('image', fs.createReadStream(imagePath));
      formData.append('code', articleCode);

      const response = await axios.post(`${API_URL}/images/upload`, formData, {
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
      
      // Si es el último intento, devolver error
      if (attempt === retries) {
        let finalMessage = serverMessage;
        
        if (isSocketError) {
          finalMessage = `Connection error (tried ${retries} times)`;
        } else if (status === 401) {
          finalMessage = 'Authentication expired - please re-login';
        } else if (status === 413) {
          finalMessage = 'File too large';
        }
        
        return { success: false, error: finalMessage };
      }
      
      // Si el error no es recuperable, no reintentar
      if (status === 400 || status === 404 || status === 409) {
        return { success: false, error: serverMessage };
      }
      
      // Esperar antes de reintentar (backoff exponencial)
      const delay = RETRY_DELAY * attempt;
      process.stdout.write(`\n   ↻ Retrying in ${delay/1000}s (attempt ${attempt}/${retries})... `);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return { success: false, error: 'Max retries exceeded' };
}

function extractArticleCode(filename) {
  // Remove extension
  const name = path.parse(filename).name;
  // Match exactly 6 digits at the start
  const match = name.match(/^(\d{6})/);
  return match ? match[1] : null;
}

async function main() {
  console.log('🚀 Starting image upload script...');
  console.log('   Config: max retries=' + MAX_RETRIES + ', base delay=' + BASE_DELAY + 'ms\n');
  
  // Login
  console.log('1. Authenticating...');
  const token = await login();
  console.log('   ✓ Logged in successfully\n');
  
  // Get all image files
  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort();
  
  console.log(`2. Found ${files.length} images to upload\n`);
  
  const results = {
    uploaded: [],
    skipped: [],
    errors: [],
    retries: 0
  };
  
  let consecutiveErrors = 0;
  let dynamicDelay = BASE_DELAY;
  
  // Process each image
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(IMAGES_DIR, filename);
    const articleCode = extractArticleCode(filename);
    
    const progress = `[${i + 1}/${files.length}]`;
    
    if (!articleCode) {
      console.log(`${progress} ⚠️  SKIP "${filename}" - no valid 6-digit code`);
      results.skipped.push(filename);
      continue;
    }
    
    // Limpiar línea anterior si hubo retry
    process.stdout.write(`${progress} Uploading "${filename}" (code: ${articleCode})... `);
    
    const result = await uploadImage(token, filePath, articleCode);
    
    if (result.success) {
      console.log('✓');
      results.uploaded.push({ filename, articleCode });
      consecutiveErrors = 0;
      dynamicDelay = BASE_DELAY; // Reset delay after success
    } else {
      // Check if it's a duplicate error (that's OK)
      if (result.error.includes('Ya existe') || result.error.includes('duplicate') || 
          result.error.includes('already exists')) {
        console.log('⚠️ (already exists)');
        results.skipped.push(filename);
      } else {
        console.log(`✗ - ${result.error}`);
        results.errors.push({ filename, error: result.error });
        consecutiveErrors++;
        
        // Aumentar delay si hay errores consecutivos
        if (consecutiveErrors > 2) {
          dynamicDelay = Math.min(dynamicDelay * 2, 5000); // Max 5 segundos
          console.log(`   ⏱️  Slowing down: next delay = ${dynamicDelay}ms`);
        }
      }
    }
    
    // Delay adaptativo entre requests
    await new Promise(resolve => setTimeout(resolve, dynamicDelay));
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`✓ Uploaded:  ${results.uploaded.length}`);
  console.log(`⚠️  Skipped:  ${results.skipped.length}`);
  console.log(`✗ Errors:   ${results.errors.length}`);
  
  // Agrupar errores por tipo
  const errorsByType = {};
  results.errors.forEach(e => {
    const key = e.error.split('(')[0].trim() || 'Unknown';
    errorsByType[key] = (errorsByType[key] || 0) + 1;
  });
  
  if (results.errors.length > 0) {
    console.log('\n⚠️ Errors by type:');
    Object.entries(errorsByType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });
    
    console.log('\n⚠️ Failed files:');
    results.errors.slice(0, 20).forEach(e => {
      console.log(`   - ${e.filename}: ${e.error}`);
    });
    
    if (results.errors.length > 20) {
      console.log(`   ... and ${results.errors.length - 20} more`);
    }
  }
  
  // Guardar lista de archivos con error para reintento posterior
  if (results.errors.length > 0) {
    const failedFiles = results.errors.map(e => e.filename);
    const retryPath = path.join(__dirname, 'failed_uploads.json');
    fs.writeFileSync(retryPath, JSON.stringify(failedFiles, null, 2));
    console.log(`\n📝 Failed files saved to: ${retryPath}`);
    console.log('   You can re-run the script to retry these files');
  }
  
  console.log('\n✅ Done!');
}

main().catch(console.error);
