const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  addedBy: { type: Number, default: null },
  addedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Admin', adminSchema);
