const REWARD_PER_VOTE = 20000;

/**
 * Telefon raqamni formatlash: +998XXXXXXXXX yoki 998XXXXXXXXX -> +998XXXXXXXXX
 */
function formatPhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('998')) cleaned = '+' + cleaned;
  else if (cleaned.startsWith('8') && cleaned.length === 11) cleaned = '+7' + cleaned.slice(1);
  else if (!cleaned.startsWith('+')) cleaned = '+998' + cleaned;
  return cleaned;
}

/**
 * Telefon raqamni ko'rsatish (admin uchun)
 * 9 ta raqam: 93-933-99-98
 * 12 ta raqam: +998-93-933-99-98
 */
function formatPhoneDisplay(raw, withCountry) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (withCountry && digits.length === 12 && digits.startsWith('998')) {
    return `+${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10, 12)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 7)}-${digits.slice(7, 9)}`;
  }
  if (digits.length === 12 && digits.startsWith('998')) {
    const local = digits.slice(3);
    return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5, 7)}-${local.slice(7, 9)}`;
  }
  return String(raw || '');
}

/**
 * Karta raqamni ko'rsatish (8600 1234 5678 9012)
 */
function formatCardDisplay(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 16) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
  }
  return String(raw || '');
}

/**
 * Statusni o'zbek tilida ko'rsatish
 */
function statusText(status) {
  const map = {
    pending: '⏳ Kutilmoqda',
    processing: '🔄 Jarayonda',
    sms_sent: '📨 SMS yuborildi',
    confirmed: '✅ Tasdiqlandi',
    rejected: '❌ Rad etildi',
  };
  return map[status] || status;
}

module.exports = { formatPhone, formatPhoneDisplay, formatCardDisplay, statusText, REWARD_PER_VOTE };
