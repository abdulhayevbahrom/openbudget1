const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim()))
  : [];

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(telegramId);
}

// Telefon raqamni formatlash (+998XXXXXXXXX)
function formatPhone(phone) {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('998')) return '+' + p;
  if (p.startsWith('8') && p.length === 11) return '+7' + p.slice(1);
  if (p.length === 9) return '+998' + p;
  return '+' + p;
}

// Status label
function statusLabel(status) {
  const map = {
    pending: '🟡 Kutilmoqda',
    processing: '🔄 Jarayonda',
    sms_sent: '📩 SMS yuborildi',
    confirmed: '✅ Tasdiqlandi',
    rejected: '❌ Avval ovoz berilgan'
  };
  return map[status] || status;
}

module.exports = { isAdmin, formatPhone, statusLabel, ADMIN_IDS };
