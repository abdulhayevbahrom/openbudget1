const mongoose = require('mongoose');

// ─── Counter (auto-increment ID uchun) ───────────────────────────────────────
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

async function getNextId() {
  const counter = await Counter.findByIdAndUpdate(
    'userId',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

// ─── User ─────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  userId: { type: Number, unique: true },        // 1,2,3... auto ID
  telegramId: { type: Number, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// ─── Phone (har bir raqam alohida yozuv) ──────────────────────────────────────
// status: 'pending' | 'processing' | 'sms_sent' | 'confirmed' | 'rejected'
const phoneSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true },  // egasi
  phone: { type: String, required: true },
  status: { type: String, default: 'pending' },
  adminId: Number,           // qaysi admin qabul qildi
  adminUsername: String,
  reward: { type: Number, default: 20000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const Phone = mongoose.model('Phone', phoneSchema);

module.exports = { User, Phone, Counter, getNextId };
