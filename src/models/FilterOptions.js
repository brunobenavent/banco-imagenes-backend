// src/models/FilterOptions.js
const mongoose = require('mongoose');

const filterOptionsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  familias: [{
    type: String
  }],
  macetas: [{
    type: String
  }],
  alturas: [{
    type: String
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = {
  FilterOptions: mongoose.model('FilterOptions', filterOptionsSchema)
};
