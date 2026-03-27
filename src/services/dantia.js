// src/services/dantia.js
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const config = require('../config');

const cookieJar = new CookieJar();

// Create axios instance for Dantia API
const dantiaClient = axios.create({
  baseURL: config.dantia.baseURL,
  withCredentials: true
});

wrapper(dantiaClient);
dantiaClient.defaults.jar = cookieJar;

// Session cache
let sessionCache = {
  accessToken: null,
  expiresAt: 0,
  isLoggingIn: false
};

// Login to Dantia API and get token
async function login() {
  // Prevent multiple concurrent login attempts
  if (sessionCache.isLoggingIn) {
    // Wait for existing login to complete
    while (sessionCache.isLoggingIn) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return sessionCache.accessToken;
  }
  
  sessionCache.isLoggingIn = true;
  
  try {
    console.log('[DantiaService] Realizando login...');
    
    const loginParams = {
      name: config.dantia.username,
      password: config.dantia.password
    };
    
    // Bypass interceptor for login request
    const response = await dantiaClient.get('/autentificar', { 
      params: loginParams,
      headers: { 'x-bypass-token': 'true' }
    });
    const { token, expiresIn } = response.data;
    
    if (!token) {
      throw new Error('Respuesta de login inválida (token faltante)');
    }
    
    // Dantia token seems to not include expiresIn in response, default to 1 hour
    const effectiveExpiresIn = 3600;
    
    // Set expiry with 30s margin
    const marginSeconds = 30;
    sessionCache.expiresAt = Date.now() + (effectiveExpiresIn - marginSeconds) * 1000;
    sessionCache.accessToken = token;
    
    console.log('[DantiaService] Login exitoso. Token válido por', effectiveExpiresIn, 'segundos');
    return token;
    
  } catch (error) {
    console.error('[DantiaService] Error en login:', error.message);
    throw new Error(`No se pudo autenticar con Dantia: ${error.message}`);
  } finally {
    sessionCache.isLoggingIn = false;
  }
}

// Ensure valid session
async function ensureValidSession() {
  const now = Date.now();
  const isValid = !!sessionCache.accessToken && sessionCache.expiresAt > now;
  
  if (isValid) {
    return sessionCache.accessToken;
  }
  
  console.log('[DantiaService] Token no válido o expirado. Refrescando sesión...');
  return await login();
}

// Add request interceptor to add token (but bypass for login)
dantiaClient.interceptors.request.use(
  async (config) => {
    // Skip token for login request
    if (config.headers['x-bypass-token']) {
      return config;
    }
    const accessToken = await ensureValidSession();
    config.headers['x-access-token'] = accessToken;
    return config;
  },
  (error) => Promise.reject(error)
);

// Query articles from Dantia ERP
// IMPORTANT: Using ONLY CodigoEmpresa=1 (no offer filters)
async function queryArticles(options = {}) {
  const { page = 1, count = 50, where = 'CodigoEmpresa=1' } = options;
  
  try {
    console.log(`[DantiaService] Consultando artículos. WHERE: ${where}`);
    
    const response = await dantiaClient.get('/adArticulosCatalogo/query', {
      params: { count, page, where }
    });
    
    return response.data;
    
  } catch (error) {
    console.error('[DantiaService] Error consultando artículos:', error.message);
    throw error;
  }
}

// Validate article code exists in Dantia
async function validateArticleCode(codigoArticulo) {
  try {
    // Query for specific article
    const where = `CodigoEmpresa=1 and CodigoArticulo='${codigoArticulo}'`;
    const response = await queryArticles({ where, count: 1 });
    
    const articles = response.$resources || [];
    return articles.length > 0 ? articles[0] : null;
    
  } catch (error) {
    console.error('[DantiaService] Error validando código de artículo:', error.message);
    return null;
  }
}

// Get all articles (paginated)
async function getAllArticles(options = {}) {
  const { page = 1, limit = 50 } = options;
  return await queryArticles({ page, count: limit });
}

// Get unique filter options from Dantia (familias, macetas, alturas)
async function getFilterOptions() {
  try {
    console.log('[DantiaService] Obteniendo opciones de filtro de Dantia...');
    
    // Use Sets to collect unique values as we go
    const familiasSet = new Set();
    const macetasSet = new Set();
    const alturasSet = new Set();
    
    let page = 1;
    const maxPages = 50; // Safety limit - 50 * 500 = 25k articles max
    
    for (page = 1; page <= maxPages; page++) {
      const response = await queryArticles({ page, count: 500 });
      const resources = response.$resources || [];
      
      if (resources.length === 0) {
        break;
      }
      
      // Extract unique values from this page
      for (const article of resources) {
        if (article.Descripcion) familiasSet.add(article.Descripcion);
        if (article._Maceta) macetasSet.add(article._Maceta);
        if (article._Altura) alturasSet.add(article._Altura);
      }
      
      console.log('[DantiaService] Page', page, '- got', resources.length, 'articles. Familias:', familiasSet.size, 'Macetas:', macetasSet.size, 'Alturas:', alturasSet.size);
      
      // If we got less than 500, we've reached the last page
      if (resources.length < 500) {
        break;
      }
    }
    
    const result = {
      familias: Array.from(familiasSet).sort(),
      macetas: Array.from(macetasSet).sort(),
      alturas: Array.from(alturasSet).sort()
    };
    
    console.log('[DantiaService] Total unique - Familias:', result.familias.length, 'Macetas:', result.macetas.length, 'Alturas:', result.alturas.length);
    
    return result;
    
  } catch (error) {
    console.error('[DantiaService] Error:', error.message);
    throw error;
  }
}

module.exports = {
  dantiaService: {
    login,
    ensureValidSession,
    queryArticles,
    validateArticleCode,
    getAllArticles,
    getFilterOptions
  }
};
