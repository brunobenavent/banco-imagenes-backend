// script/enrich-images.js
// Script para enriquecer imágenes con info de Dantia
// Procesa todo de golpe sin delays

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/api';

// Configuración
const USERNAME = 'brunobenavent@gmail.com';
const PASSWORD = 'admin123';
const MAX_RETRIES = 3;

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

async function getImagesNeedingEnrichment(token) {
  try {
    const response = await axios.get(`${API_URL}/images/needs-enrichment`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching images:', error.response?.data || error.message);
    throw error;
  }
}

async function enrichImage(token, imageId, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(`${API_URL}/images/enrich/${imageId}`, {}, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000
      });
      return { success: true, data: response.data };
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      const isSocketError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || 
                            error.message.includes('socket hang up');
      
      // Si el código no existe en Dantia, no reintentar
      if (message.includes('no encontrado en Dantia') || status === 404) {
        return { success: false, error: 'Not found in Dantia', permanent: true };
      }
      
      if (attempt === retries) {
        let finalMessage = message;
        if (isSocketError) {
          finalMessage = 'Connection error';
        }
        return { success: false, error: finalMessage, permanent: false };
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function main() {
  console.log('🚀 Starting image enrichment process...\n');
  
  // Login
  console.log('1. Authenticating...');
  const token = await login();
  console.log('   ✓ Logged in successfully\n');
  
  // Get images needing enrichment
  console.log('2. Fetching images that need enrichment...');
  const { count, images } = await getImagesNeedingEnrichment(token);
  console.log(`   Found ${count} images needing enrichment\n`);
  
  if (count === 0) {
    console.log('✅ No images need enrichment!\n');
    return;
  }
  
  const results = {
    enriched: [],
    notFound: [],
    errors: []
  };
  
  // Process all at once
  console.log('3. Enriching all images (one by one, 2s delay)...\n');
  
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    process.stdout.write(`[${i + 1}/${count}] ${image.articleCode}... `);
    
    const result = await enrichImage(token, image._id);
    
    if (result.success) {
      console.log('✓');
      results.enriched.push(image.articleCode);
    } else if (result.permanent) {
      console.log(`⚠️ (${result.error})`);
      results.notFound.push(image.articleCode);
    } else {
      console.log(`✗ (${result.error})`);
      results.errors.push({ code: image.articleCode, id: image._id, error: result.error });
    }
    
    // Esperar 2 segundos entre cada imagen para no sobrecargar Dantia
    if (i < images.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(50));
  console.log(`✓ Enriched:    ${results.enriched.length}`);
  console.log(`⚠️  Not found:  ${results.notFound.length}`);
  console.log(`✗ Errors:      ${results.errors.length}`);
  
  if (results.errors.length > 0) {
    console.log('\n⚠️ Failed to enrich:');
    results.errors.forEach(e => console.log(`   - ${e.code}: ${e.error}`));
  }
  
  console.log('\n✅ Done!');
}

main().catch(console.error);
