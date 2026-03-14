const { Telegraf } = require('telegraf');
const { startHandler, contactHandler, textHandler } = require('./handlers/userHandler');

function createUserBot(token) {
  const bot = new Telegraf(token);

  bot.start(startHandler);
  bot.on('contact', contactHandler);
  bot.on('text', textHandler);

  bot.catch((err) => {
    console.error('❌ User bot xato:', err);
  });

  return bot;
}

module.exports = { createUserBot };
