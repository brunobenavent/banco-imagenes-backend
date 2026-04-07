// src/routes/images.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { Image } from '../models/Image.js';
import { FilterOptions } from '../models/FilterOptions.js';
import { uploadImage, getUrl, getSignedUrl, deleteImage, imageExists } from '../services/cloudinary.js';
import { validateArticleCode, getFilterOptions } from '../services/dantia.js';
import config from '../config/index.js';
import { authenticate, authorize } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSize },
  fileFilter: function(req, file, cb) {
    if (config.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos JPG/PNG.'));
    }
  }
});

// GET /api/images - List all images with pagination
router.get('/', authenticate, async function(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const search = req.query.search || '';
    const familia = req.query.familia || '';
    const maceta = req.query.maceta || '';
    const altura = req.query.altura || '';
    const sortBy = req.query.sortBy || 'newest';
    
    // Build query
    const query = {};
    
    // Search in articleCode or dantiaInfo fields
    if (search) {
      query.$or = [
        { articleCode: { $regex: '^' + search, $options: 'i' } },
        { 'dantiaInfo.DescripcionArticulo': { $regex: search, $options: 'i' } },
        { 'dantiaInfo.Descripcion2Articulo': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filters
    if (familia) query['dantiaInfo.Descripcion'] = familia;
    if (maceta) query['dantiaInfo._Maceta'] = maceta;
    if (altura) query['dantiaInfo._Altura'] = altura;
    
    // Sort
    let sortObj = {};
    switch (sortBy) {
      case 'oldest':
        sortObj = { createdAt: 1 };
        break;
      case 'code':
        sortObj = { articleCode: 1 };
        break;
      case 'name':
        sortObj = { 'dantiaInfo.DescripcionArticulo': 1 };
        break;
      default: // newest
        sortObj = { createdAt: -1 };
    }
    
    const skip = (page - 1) * limit;
    const total = await Image.countDocuments(query);
    const images = await Image.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .populate('uploadedBy', 'email nombre')
      .lean();
    
    res.json({
      images,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/images/refresh-dantia/:id - Refresh Dantia info for an image
// IMPORTANT: This route MUST be before /:id routes to avoid conflicts
router.post('/refresh-dantia/:id', authenticate, async function(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);
    
    if (!image) {
      return res.status(404).json({ message: 'Imagen no encontrada.' });
    }
    
    let dantiaArticle = null;
    let dantiaError = null;
    
    try {
      const result = await validateArticleCode(image.articleCode);
      dantiaArticle = result.article;
      dantiaError = result.error;
    } catch (err) {
      dantiaError = err.message;
    }
    
    // Check if Dantia is unreachable
    if (dantiaError && dantiaError.includes('timeout')) {
      console.error('[refresh-dantia] Error: Dantia no está accesible desde Vercel');
      return res.status(503).json({ 
        message: 'El servidor de Dantia no está accesible desde el servidor de producción. Por favor, contacta al administrador o usa el servidor local para actualizar este código.'
      });
    }
    
    // Check if Dantia returned an error
    if (dantiaError) {
      console.error('[refresh-dantia] Error consultando Dantia:', dantiaError);
      return res.status(503).json({ message: 'Error de conexión con Dantia. Intenta de nuevo.' });
    }
    
    // Check if article was not found
    if (!dantiaArticle) {
      return res.status(404).json({ 
        message: 'Código de artículo no encontrado en Dantia: ' + image.articleCode
      });
    }
    
    const dantiaInfo = {
      CodigoArticulo: dantiaArticle.CodigoArticulo,
      DescripcionArticulo: dantiaArticle.DescripcionArticulo,
      Descripcion: dantiaArticle.Descripcion,
      _TipoMaceta: dantiaArticle._TipoMaceta,
      _Maceta: dantiaArticle._Maceta,
      _Altura: dantiaArticle._Altura,
      Descripcion2Articulo: dantiaArticle.Descripcion2Articulo,
      Precio1: dantiaArticle.Precio1,
      CodigoFamilia: dantiaArticle.CodigoFamilia
    };
    
    image.dantiaInfo = dantiaInfo;
    await image.save();
    
    res.json({
      message: 'Info de Dantia actualizada exitosamente.',
      image: {
        id: image._id,
        articleCode: image.articleCode,
        dantiaInfo: image.dantiaInfo
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// GET /api/images/filters - Get filter options
router.get('/filters', authenticate, async function(req, res, next) {
  try {
    // Get distinct values directly from local images (faster and more reliable)
    const familias = await Image.distinct('dantiaInfo.Descripcion', { 'dantiaInfo.Descripcion': { $ne: null, $ne: '' } });
    const macetas = await Image.distinct('dantiaInfo._Maceta', { 'dantiaInfo._Maceta': { $ne: null, $ne: '' } });
    const alturas = await Image.distinct('dantiaInfo._Altura', { 'dantiaInfo._Altura': { $ne: null, $ne: '' } });

    res.json({
      familias: familias.filter(f => f).sort(),
      macetas: macetas.filter(m => m).sort(),
      alturas: alturas.filter(a => a).sort()
    });
  } catch (error) {
    next(error);
  }
});

// Generate unique suffix for new uploads
async function getNextSuffix(articleCode) {
  const lastImage = await Image.findOne({ articleCode }).sort({ suffix: -1 }).select('suffix');
  if (!lastImage) return 100;
  return lastImage.suffix + 1;
}

// Check if exact duplicate exists
async function checkDuplicate(articleCode, suffix) {
  const existing = await Image.findOne({ articleCode, suffix });
  return !!existing;
}

// Parse filename to extract article code
function parseFilename(filename) {
  const name = path.parse(filename).name;
  const match = name.match(/^(\d{6})/);
  if (!match) return null;
  return { articleCode: match[1] };
}

// Helper function to check if cache is old (older than 7 days)
function isCacheOld(lastUpdated) {
  if (!lastUpdated) return true;
  const week = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(lastUpdated).getTime() > week;
}

// In-memory lock to prevent concurrent syncs
var isSyncingFilters = false;

// POST /api/images/upload - Editor/Admin only
router.post('/upload', authenticate, authorize('editor', 'admin'), upload.single('image'), async function(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se ha subido ningún archivo.' });
    }
    
    const originalFilename = req.file.originalname;
    let articleCode = req.body.code || req.query.code || '';
    
    if (!articleCode) {
      const parsed = parseFilename(originalFilename);
      if (!parsed) {
        return res.status(400).json({ message: 'Proporciona un código de 6 dígitos o usa un archivo con nombre XXXXXX.jpg' });
      }
      articleCode = parsed.articleCode;
    }
    
    if (!/^\d{6}$/.test(articleCode)) {
      return res.status(400).json({ message: 'El código debe tener exactamente 6 dígitos numéricos' });
    }
    
    // Validate article code - handle errors gracefully
    let dantiaArticle = null;
    try {
      dantiaArticle = await validateArticleCode(articleCode);
    } catch (validateError) {
      console.error('[upload] Error validando código:', validateError.message);
      return res.status(503).json({ message: 'Error de conexión con Dantia. Intenta de nuevo.' });
    }
    
    if (!dantiaArticle) {
      return res.status(400).json({ message: 'El código de artículo ' + articleCode + ' no existe en Dantia.' });
    }
    
    let suffix = await getNextSuffix(articleCode);
    const publicId = articleCode + '-' + String(suffix).padStart(3, '0');
    
    const isDuplicate = await checkDuplicate(articleCode, suffix);
    if (isDuplicate) {
      return res.status(400).json({ message: 'Ya existe una imagen con código ' + articleCode + '-' + String(suffix).padStart(3, '0') + '.jpg' });
    }
    
    const cloudinaryResult = await uploadImage(req.file.buffer, publicId);
    
    const dantiaInfo = {
      CodigoArticulo: dantiaArticle.CodigoArticulo,
      DescripcionArticulo: dantiaArticle.DescripcionArticulo,
      Descripcion: dantiaArticle.Descripcion,
      _TipoMaceta: dantiaArticle._TipoMaceta,
      _Maceta: dantiaArticle._Maceta,
      _Altura: dantiaArticle._Altura,
      Descripcion2Articulo: dantiaArticle.Descripcion2Articulo,
      Precio1: dantiaArticle.Precio1,
      CodigoFamilia: dantiaArticle.CodigoFamilia
    };
    
    const image = new Image({
      articleCode,
      suffix,
      originalFilename: req.file.originalname,
      cloudinaryPublicId: cloudinaryResult.public_id,
      cloudinaryUrl: cloudinaryResult.secure_url,
      sizes: {
        real: getSignedUrl(cloudinaryResult.public_id, 'real'),
        medium: getSignedUrl(cloudinaryResult.public_id, 'medium'),
        small: getSignedUrl(cloudinaryResult.public_id, 'small')
      },
      uploadedBy: req.user.userId,
      dantiaInfo
    });
    
    await image.save();
    
    res.status(201).json({
      message: 'Imagen subida exitosamente.',
      image: {
        id: image._id,
        articleCode: image.articleCode,
        suffix: image.suffix,
        filename: articleCode + '-' + String(suffix).padStart(3, '0') + '.jpg',
        url: image.cloudinaryUrl,
        sizes: image.sizes,
        dantiaInfo: image.dantiaInfo
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// PUT /api/images/:id - Update image article code
router.put('/:id', authenticate, async function(req, res, next) {
  try {
    const { articleCode } = req.body;
    
    if (!articleCode) {
      return res.status(400).json({ message: 'El código de artículo es requerido.' });
    }
    
    if (!/^\d{6}$/.test(articleCode)) {
      return res.status(400).json({ message: 'El código de artículo debe tener 6 dígitos.' });
    }
    
    const image = await Image.findById(req.params.id);
    
    if (!image) {
      return res.status(404).json({ message: 'Imagen no encontrada.' });
    }
    
    // If same code, just refresh Dantia info
    if (articleCode === image.articleCode) {
      let dantiaArticle = null;
      try {
        dantiaArticle = await validateArticleCode(image.articleCode);
      } catch (validateError) {
        console.error('[PUT /:id] Error validando código:', validateError.message);
        return res.status(503).json({ message: 'Error de conexión con Dantia. Intenta de nuevo.' });
      }
      
      if (!dantiaArticle) {
        return res.status(404).json({ message: 'Código de artículo no encontrado en Dantia: ' + articleCode });
      }
      
      image.dantiaInfo = {
          CodigoArticulo: dantiaArticle.CodigoArticulo,
          DescripcionArticulo: dantiaArticle.DescripcionArticulo,
          Descripcion: dantiaArticle.Descripcion,
          _TipoMaceta: dantiaArticle._TipoMaceta,
          _Maceta: dantiaArticle._Maceta,
          _Altura: dantiaArticle._Altura,
          Descripcion2Articulo: dantiaArticle.Descripcion2Articulo,
          Precio1: dantiaArticle.Precio1,
          CodigoFamilia: dantiaArticle.CodigoFamilia
        };
        await image.save();
      
      return res.json({
        message: 'Info de Dantia actualizada.',
        image: {
          id: image._id,
          articleCode: image.articleCode,
          suffix: image.suffix,
          dantiaInfo: image.dantiaInfo
        }
      });
    }
    
    // Find the highest suffix for the new articleCode
    const lastImageWithNewCode = await Image.findOne({ 
      articleCode, 
      _id: { $ne: image._id } 
    }).sort({ suffix: -1 });
    
    // If new code already exists, use next available suffix
    let newSuffix = image.suffix;
    if (lastImageWithNewCode) {
      newSuffix = lastImageWithNewCode.suffix + 1;
    }
    
    // FIRST validate against Dantia BEFORE saving to DB
    let dantiaArticle = null;
    try {
      dantiaArticle = await validateArticleCode(articleCode);
    } catch (validateError) {
      console.error('[PUT /:id] Error validando código:', validateError.message);
      return res.status(503).json({ message: 'Error de conexión con Dantia. Intenta de nuevo.' });
    }
    
    // Only save if Dantia validation passes
    if (!dantiaArticle) {
      return res.status(404).json({ message: 'Código de artículo no encontrado en Dantia: ' + articleCode });
    }
    
    // Now save to DB with validated data
    image.articleCode = articleCode;
    image.suffix = newSuffix;
    image.dantiaInfo = {
      CodigoArticulo: dantiaArticle.CodigoArticulo,
      DescripcionArticulo: dantiaArticle.DescripcionArticulo,
      Descripcion: dantiaArticle.Descripcion,
      _TipoMaceta: dantiaArticle._TipoMaceta,
      _Maceta: dantiaArticle._Maceta,
      _Altura: dantiaArticle._Altura,
      Descripcion2Articulo: dantiaArticle.Descripcion2Articulo,
      Precio1: dantiaArticle.Precio1,
      CodigoFamilia: dantiaArticle.CodigoFamilia
    };
    await image.save();
    
    res.json({
      message: lastImageWithNewCode ? 
        `Código actualizado a ${articleCode}-${String(newSuffix).padStart(3, '0')} (suffix automático)` :
        'Código actualizado correctamente.',
      image: {
        id: image._id,
        articleCode: image.articleCode,
        suffix: newSuffix,
        dantiaInfo: image.dantiaInfo
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// GET /api/images/article/:articleCode
router.get('/:id', authenticate, async function(req, res, next) {
  try {
    var image = await Image.findById(req.params.id).populate('uploadedBy', 'email nombre');
    
    if (!image) {
      return res.status(404).json({ message: 'Imagen no encontrada.' });
    }
    
    res.json({ image: image });
    
  } catch (error) {
    next(error);
  }
});

// GET /api/images/:id/download/:size
router.get('/:id/download/:size', authenticate, async function(req, res, next) {
  try {
    var id = req.params.id;
    var size = req.params.size;
    
    if (!['real', 'medium', 'small'].includes(size)) {
      return res.status(400).json({ message: 'Tamaño inválido. Use: real, medium o small.' });
    }
    
    var image = await Image.findById(id);
    
    if (!image) {
      return res.status(404).json({ message: 'Imagen no encontrada.' });
    }
    
    var downloadUrl = image.sizes[size];
    res.redirect(downloadUrl);
    
  } catch (error) {
    next(error);
  }
});

// DELETE /api/images/:id - Editor/Admin only
router.delete('/:id', authenticate, authorize('editor', 'admin'), async function(req, res, next) {
  try {
    var image = await Image.findById(req.params.id);
    
    if (!image) {
      return res.status(404).json({ message: 'Imagen no encontrada.' });
    }
    
    await deleteImage(image.cloudinaryPublicId);
    await Image.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Imagen eliminada exitosamente.' });
    
  } catch (error) {
    next(error);
  }
});

// POST /api/images/upload-basic - Editor/Admin only
// Upload without Dantia validation (for offline/missing Dantia scenarios)
router.post('/upload-basic', authenticate, authorize('editor', 'admin'), upload.single('image'), async function(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se ha subido ningún archivo.' });
    }
    
    const originalFilename = req.file.originalname;
    let articleCode = req.body.code || req.query.code || '';
    
    if (!articleCode) {
      const parsed = parseFilename(originalFilename);
      if (!parsed) {
        return res.status(400).json({ message: 'Proporciona un código de 6 dígitos o usa un archivo con nombre XXXXXX.jpg' });
      }
      articleCode = parsed.articleCode;
    }
    
    if (!/^\d{6}$/.test(articleCode)) {
      return res.status(400).json({ message: 'El código debe tener exactamente 6 dígitos numéricos' });
    }
    
    let suffix = await getNextSuffix(articleCode);
    const publicId = articleCode + '-' + String(suffix).padStart(3, '0');
    
    const isDuplicate = await checkDuplicate(articleCode, suffix);
    if (isDuplicate) {
      return res.status(400).json({ message: 'Ya existe una imagen con código ' + articleCode + '-' + String(suffix).padStart(3, '0') + '.jpg' });
    }
    
    const cloudinaryResult = await uploadImage(req.file.buffer, publicId);
    
    // Create image WITHOUT dantiaInfo (will be enriched later)
    const image = new Image({
      articleCode,
      suffix,
      originalFilename: req.file.originalname,
      cloudinaryPublicId: cloudinaryResult.public_id,
      cloudinaryUrl: cloudinaryResult.secure_url,
      sizes: {
        real: getSignedUrl(cloudinaryResult.public_id, 'real'),
        medium: getSignedUrl(cloudinaryResult.public_id, 'medium'),
        small: getSignedUrl(cloudinaryResult.public_id, 'small')
      },
      uploadedBy: req.user.userId,
      dantiaInfo: null // No Dantia info - will be enriched later
    });
    
    await image.save();
    
    res.status(201).json({
      message: 'Imagen subida exitosamente (sin info Dantia).',
      needsEnrichment: true,
      image: {
        id: image._id,
        articleCode: image.articleCode,
        suffix: image.suffix,
        filename: articleCode + '-' + String(suffix).padStart(3, '0') + '.jpg',
        url: image.cloudinaryUrl,
        sizes: image.sizes
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// GET /api/images/article/:articleCode
router.get('/article/:articleCode', authenticate, async function(req, res, next) {
  try {
    var articleCode = req.params.articleCode;
    
    var images = await Image.find({ articleCode: articleCode }).populate('uploadedBy', 'email nombre').sort({ suffix: 1 });
    
    res.json({ images: images });
    
  } catch (error) {
    next(error);
  }
});

export default router;
