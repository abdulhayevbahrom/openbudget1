const Admin = require('../models/Admin');

const adminIds = new Set();

async function loadAdmins() {
  adminIds.clear();
  const admins = await Admin.find();
  for (const a of admins) {
    adminIds.add(Number(a.userId));
  }
  return adminIds.size;
}

function isAdmin(userId) {
  return adminIds.has(Number(userId));
}

function getAdminIds() {
  return Array.from(adminIds);
}

async function addAdmin(tgUser, addedBy = null) {
  let rawId = tgUser && Object.prototype.hasOwnProperty.call(tgUser, 'userId')
    ? tgUser.userId
    : tgUser?.id;
  if (typeof rawId === 'string' && /^\d+$/.test(rawId)) rawId = Number(rawId);
  const userId = typeof rawId === 'number' ? rawId : NaN;
  if (!Number.isFinite(userId)) return false;
  if (isAdmin(userId)) return false;

  await Admin.create({
    userId,
    username: tgUser.username || null,
    firstName: tgUser.first_name || tgUser.firstName || '',
    lastName: tgUser.last_name || tgUser.lastName || '',
    addedBy: addedBy ? Number(addedBy) : null,
  });

  adminIds.add(userId);
  return true;
}

async function ensureFirstAdmin(tgUser) {
  if (adminIds.size > 0) return false;
  return addAdmin(tgUser, null);
}

module.exports = { loadAdmins, isAdmin, getAdminIds, addAdmin, ensureFirstAdmin };
