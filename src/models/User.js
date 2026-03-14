const mongoose = require('mongoose');

const phoneSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  displayPhone: { type: String }, // admin uchun ko'rinish
  status: {
    type: String,
    enum: ['pending', 'processing', 'sms_sent', 'confirmed', 'rejected'],
    default: 'pending'
  },
  addedAt: { type: Date, default: Date.now },
  confirmedAt: { type: Date },
  adminId: { type: String }, // qaysi admin jarayonga oldi
});

const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  sequentialId: { type: Number, unique: true }, // 1, 2, 3, ...
  username: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  phones: [phoneSchema],
  totalEarned: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  state: { type: String, default: null }, // bot holati
  currentPhone: { type: String, default: null }, // SMS kod kutilayotgan raqam
});

module.exports = mongoose.model('User', userSchema);
