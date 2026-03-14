const { getAdminIds, loadAdmins } = require('./adminStore');

let adminBot = null;

function setAdminBot(bot) {
  adminBot = bot;
}

async function sendToAdmins(text, extra) {
  if (!adminBot) {
    console.error('❌ Admin bot o\'rnatilmagan (adminNotifier).');
    return;
  }

  let adminIds = getAdminIds();
  if (!adminIds.length) {
    await loadAdmins();
    adminIds = getAdminIds();
  }

  for (const adminId of adminIds) {
    try {
      await adminBot.telegram.sendMessage(adminId, text, extra);
    } catch (e) {
      console.error(`Admin ${adminId} ga xabar yuborib bo'lmadi:`, e.message);
    }
  }
}

module.exports = { setAdminBot, sendToAdmins };
