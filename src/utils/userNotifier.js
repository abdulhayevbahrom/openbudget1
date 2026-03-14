let userBot = null;

function setUserBot(bot) {
  userBot = bot;
}

async function sendToUser(userId, text, extra) {
  if (!userBot) {
    console.error('❌ User bot o\'rnatilmagan (userNotifier).');
    return;
  }
  try {
    await userBot.telegram.sendMessage(Number(userId), text, extra);
  } catch (e) {
    console.error(`User ${userId} ga xabar yuborib bo'lmadi:`, e.message);
  }
}

module.exports = { setUserBot, sendToUser };
