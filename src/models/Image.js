// src/models/Image.js
import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
  articleCode: {
    type: String,
    required: true,
    match: /^\d{6}$/, // 6-digit code
    index: true
  },
  suffix: {
    type: Number,
    required: true,
    default: 100
  },
  originalFilename: {
    type: String,
    required: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true
  },
  cloudinaryUrl: {
    type: String,
    required: true
  },
  sizes: {
    real: String,
    medium: String,
    small: String
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Dantia article info (full data)
  dantiaInfo: {
    CodigoArticulo: String,
    DescripcionArticulo: String,
    Descripcion: String,           // Familia
    _TipoMaceta: String,
    _Maceta: String,
    _Altura: String,
    Descripcion2Articulo: String,
    Precio1: Number,
    CodigoFamilia: String
  }
}, {
  timestamps: true
});

// Index for efficient queries
imageSchema.index({ articleCode: 1, suffix: 1 }, { unique: true });
imageSchema.index({ 'dantiaInfo.Descripcion': 1 });
imageSchema.index({ 'dantiaInfo._Maceta': 1 });
imageSchema.index({ 'dantiaInfo._Altura': 1 });

export const Image = mongoose.model('Image', imageSchema);
