// src/services/dantia.js
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import config from '../config/index.js';

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
export async function login() {
  console.log('[DantiaService] Intentando login...');
  console.log('[DantiaService] URL:', config.dantia.baseURL);
  console.log('[DantiaService] Username:', config.dantia.username ? 'configurado' : 'FALTANTE');
  
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
      console.error('[DantiaService] Respuesta de login inválida (token faltante)');
      return null;
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
    // Return null instead of throwing - prevents server crash
    return null;
  } finally {
    sessionCache.isLoggingIn = false;
  }
}

// Ensure valid session
export async function ensureValidSession() {
  const now = Date.now();
  const isValid = !!sessionCache.accessToken && sessionCache.expiresAt > now;
  
  if (isValid) {
    return sessionCache.accessToken;
  }
  
  console.log('[DantiaService] Token no válido o expirado. Refrescando sesión...');
  const token = await login();
  if (!token) {
    console.error('[DantiaService] No se pudo obtener token de sesión');
    return null;
  }
  return token;
}

// Add request interceptor to add token (but bypass for login)
dantiaClient.interceptors.request.use(
  async (config) => {
    // Skip token for login request
    if (config.headers['x-bypass-token']) {
      return config;
    }
    const accessToken = await ensureValidSession();
    if (!accessToken) {
      console.warn('[DantiaService] No hay token válido - la	request puede fallar');
    }
    config.headers['x-access-token'] = accessToken || '';
    return config;
  },
  (error) => Promise.reject(error)
);

// Query articles from Dantia ERP
export async function queryArticles(options = {}) {
  const { page = 1, count = 50, where = 'CodigoEmpresa=1' } = options;
  
  try {
    console.log(`[DantiaService] Consultando artículos. WHERE: ${where}`);
    console.log(`[DantiaService] BaseURL: ${config.dantia.baseURL}`);
    
    const response = await dantiaClient.get('/adArticulosCatalogo/query', {
      params: { count, page, where },
      timeout: 30000,
      // Add headers to help with debugging
      validateStatus: (status) => status < 500
    });
    
    console.log(`[DantiaService] Response status: ${response.status}`);
    return response.data;
    
  } catch (error) {
    console.error('[DantiaService] Error consultando artículos:', error.message);
    console.error('[DantiaService] Error code:', error.code);
    console.error('[DantiaService] Error response:', error.response?.status);
    return { $resources: [] };
  }
}

// Get inactive articles only (for bulk sync)
export async function getInactiveArticles(options = {}) {
  const { page = 1, count = 50 } = options;
  const where = 'CodigoEmpresa=1 and StatusInactivo=1';
  
  try {
    console.log(`[DantiaService] Consultando artículos inactivos. WHERE: ${where}`);
    
    const response = await dantiaClient.get('/adArticulosCatalogo/query', {
      params: { count, page, where },
      timeout: 15000
    });
    
    return response.data;
    
  } catch (error) {
    console.error('[DantiaService] Error consultando artículos inactivos:', error.message);
    return { $resources: [] };
  }
}

// Validate article code exists in Dantia (both active and inactive)
export async function validateArticleCode(codigoArticulo) {
  let lastError = null;
  
  try {
    console.log('[validateArticleCode] Iniciando validación para código:', codigoArticulo);
    console.log('[validateArticleCode] Dantia baseURL:', config.dantia.baseURL);
    console.log('[validateArticleCode] Dantia username:', config.dantia.username ? ' configurado' : 'FALTANTE');
    
    // Query for specific article - API returns both active and inactive by default
    const where = `CodigoEmpresa=1 and CodigoArticulo='${codigoArticulo}'`;
    const response = await queryArticles({ where, count: 1 });
    
    console.log('[validateArticleCode] Response received, resources:', response.$resources?.length || 0);
    
    const articles = response.$resources || [];
    if (articles.length === 0) {
      console.log('[validateArticleCode] Artículo no encontrado en Dantia');
      return { article: null, error: null };
    }
    
    const article = articles[0];
    // Check StatusInactivo - if value is 1, it's inactive
    const isInactive = article.StatusInactivo?.value === 1;
    
    // Return article info - include the inactive status
    return { 
      article: {
        ...article,
        _Activo: !isInactive
      }, 
      error: null 
    };
    
  } catch (error) {
    console.error('[DantiaService] Error validando código de artículo:', error.message);
    // Check if it's a timeout error (Dantia unreachable)
    if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
      lastError = 'timeout';
    } else {
      lastError = error.message;
    }
    return { article: null, error: lastError };
  }
}

// Get all articles (paginated)
export async function getAllArticles(options = {}) {
  const { page = 1, limit = 50 } = options;
  return await queryArticles({ page, count: limit });
}

// Get unique filter options from Dantia (familias, macetas, alturas)
export async function getFilterOptions() {
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
