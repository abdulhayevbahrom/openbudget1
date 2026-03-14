const { getAdminIds, loadAdmins } = require("./adminStore");

let adminBot = null;

function setAdminBot(bot) {
  adminBot = bot;
}

async function sendToAdmins(text, extra) {
  if (!adminBot) {
    console.error("❌ Admin bot o'rnatilmagan (adminNotifier).");
    return;
  }

  let adminIds = getAdminIds();
  if (!adminIds.length) {
    await loadAdmins();
    adminIds = getAdminIds();
  }

  const sent = [];
  for (const adminId of adminIds) {
    try {
      const msg = await adminBot.telegram.sendMessage(adminId, text, extra);
      if (msg && msg.message_id) {
        sent.push({ adminId, messageId: msg.message_id });
      }
    } catch (e) {
      // console.error(`Admin ${adminId} ga xabar yuborib bo'lmadi:`, e.message);
    }
  }
  return sent;
}

async function editAdminMessages(messageRefs, text, extra, options = {}) {
  if (!adminBot) {
    console.error("❌ Admin bot o'rnatilmagan (adminNotifier).");
    return;
  }
  if (!Array.isArray(messageRefs) || messageRefs.length === 0) return;
  const skipAdminId = Number.isFinite(options.skipAdminId)
    ? Number(options.skipAdminId)
    : null;

  for (const ref of messageRefs) {
    if (!ref) continue;
    const adminId = Number(ref.adminId);
    const messageId = Number(ref.messageId);
    if (!Number.isFinite(adminId) || !Number.isFinite(messageId)) continue;
    if (skipAdminId !== null && adminId === skipAdminId) continue;
    try {
      await adminBot.telegram.editMessageText(
        adminId,
        messageId,
        null,
        text,
        extra,
      );
    } catch (e) {
      console.error(`Admin ${adminId} xabarini tahrirlab bo'lmadi:`, e.message);
    }
  }
}

async function sendToAdminsSelective(
  text,
  extraForOwner,
  ownerAdminId,
  extraForOthers = null,
) {
  if (!adminBot) {
    console.error("❌ Admin bot o'rnatilmagan (adminNotifier).");
    return;
  }

  let adminIds = getAdminIds();
  if (!adminIds.length) {
    await loadAdmins();
    adminIds = getAdminIds();
  }

  const ownerId = Number(ownerAdminId);
  for (const adminId of adminIds) {
    const extra =
      Number.isFinite(ownerId) && adminId === ownerId
        ? extraForOwner
        : extraForOthers;
    try {
      await adminBot.telegram.sendMessage(adminId, text, extra || undefined);
    } catch (e) {
      console.error(`Admin ${adminId} ga xabar yuborib bo'lmadi:`, e.message);
    }
  }
}

module.exports = {
  setAdminBot,
  sendToAdmins,
  editAdminMessages,
  sendToAdminsSelective,
};
