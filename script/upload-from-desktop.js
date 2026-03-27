// script/upload-from-desktop.js
// Sube imágenes desde el Desktop del usuario

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const API_URL = 'http://localhost:3000/api';

const USERNAME = 'brunobenavent@gmail.com';
const PASSWORD = 'admin123';

const IMAGE_FILES = [
  '/Users/brunobenaventcolomo/Desktop/236317-0.jpg',
  '/Users/brunobenaventcolomo/Desktop/001137-0.jpg',
  '/Users/brunobenaventcolomo/Desktop/236321-0.jpg',
  '/Users/brunobenaventcolomo/Desktop/001141-0.jpg',
  '/Users/brunobenaventcolomo/Desktop/236320-0.jpg'
];

async function login() {
  const response = await axios.post(`${API_URL}/auth/login`, {
    email: USERNAME,
    password: PASSWORD
  });
  return response.data.token;
}

async function uploadImage(token, imagePath) {
  const filename = path.basename(imagePath);
  const match = filename.match(/^(\d+)-(\d+)\.jpg$/);
  
  if (!match) {
    console.log(`  ⚠️ Skip: ${filename} (formato no reconocido)`);
    return;
  }
  
  const articleCode = match[1];
  const suffix = parseInt(match[2]);
  
  console.log(`  Subiendo: ${filename} (código: ${articleCode}, suffix: ${suffix})`);
  
  const formData = new FormData();
  formData.append('image', fs.createReadStream(imagePath));
  formData.append('articleCode', articleCode);
  formData.append('suffix', suffix);
  
  try {
    const response = await axios.post(`${API_URL}/images/upload-basic`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      },
      timeout: 30000
    });
    console.log(`  ✅ ${response.data.image?.articleCode || articleCode}`);
    return true;
  } catch (error) {
    console.log(`  ❌ Error: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Subiendo imágenes...\n');
  
  const token = await login();
  console.log('✅ Logueado\n');
  
  let uploaded = 0;
  for (const imagePath of IMAGE_FILES) {
    if (fs.existsSync(imagePath)) {
      const success = await uploadImage(token, imagePath);
      if (success) uploaded++;
      await new Promise(r => setTimeout(r, 500));
    } else {
      console.log(`  ⚠️ No existe: ${imagePath}`);
    }
  }
  
  console.log(`\n📊 Total subidas: ${uploaded}/${IMAGE_FILES.length}`);
}

main().catch(console.error);