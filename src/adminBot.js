const { Telegraf, Markup } = require('telegraf');
const {
  handleProcess,
  handleSmsSent,
  handleConfirm,
  handleReject,
  handleAlreadyVoted,
  adminStats,
  adminPending,
} = require('./handlers/adminHandler');
const { isAdmin, addAdmin, ensureFirstAdmin, loadAdmins } = require('./utils/adminStore');
const User = require('./models/User');

function normalizePhoneInput(input) {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+998') && digits.length === 12 && digits.startsWith('998')) {
    return '+' + digits;
  }
  if (digits.length === 9) {
    return '+998' + digits;
  }
  if (digits.length === 12 && digits.startsWith('998')) {
    return '+' + digits;
  }
  return null;
}

function createAdminBot(token) {
  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    await loadAdmins();
    if (isAdmin(ctx.from.id)) {
      return ctx.reply('🔧 Admin botga xush kelibsiz.', {
        parse_mode: 'HTML',
        ...Markup.keyboard([
          ['/stats', '/pending'],
          ['➕ Admin qo\'shish', '/myid'],
        ]).resize()
      });
    }

    const wasFirst = await ensureFirstAdmin(ctx.from);
    if (wasFirst) {
      return ctx.reply('✅ Siz birinchi admin sifatida qo\'shildingiz.');
    }

    return ctx.reply(
      `❌ Ruxsat yo'q.\n` +
      `Admin bo'lish uchun mavjud admin sizni qo'shishi kerak.\n` +
      `Sizning ID: <code>${ctx.from.id}</code>`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('myid', async (ctx) => {
    return ctx.reply(`🆔 Sizning ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
  });

  bot.hears('➕ Admin qo\'shish', async (ctx) => {
    await loadAdmins();
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q');
    return ctx.reply(
      `➕ Admin qo'shish uchun username yoki raqam kiriting.`
    );
  });

  bot.on('text', async (ctx) => {
    await loadAdmins();
    if (!isAdmin(ctx.from.id)) return;

    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const raw = text;
    let targetUser = null;

    if (raw.startsWith('@')) {
      const username = raw.slice(1).toLowerCase();
      targetUser = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    } else if (/^\d+$/.test(raw)) {
      if (raw.length >= 9) {
        const phone = normalizePhoneInput(raw);
        if (phone) {
          targetUser = await User.findOne({ 'phones.phone': phone });
        }
      } else {
        const userId = Number(raw);
        targetUser = await User.findOne({ userId });
      }
    } else {
      const username = raw.toLowerCase();
      targetUser = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    }

    if (!targetUser) {
      return ctx.reply('❌ Foydalanuvchi topilmadi. Username yoki telefon raqamni tekshiring.');
    }
    if (!Number.isFinite(targetUser.userId)) {
      return ctx.reply('❌ Telegram ID topilmadi. Foydalanuvchi botdan /start qilgan bo\'lishi kerak.');
    }

    const added = await addAdmin(targetUser, ctx.from.id);
    if (!added) return ctx.reply('ℹ️ Bu foydalanuvchi allaqachon admin.');
    return ctx.reply(`✅ Admin qo'shildi: ${targetUser.userId} (@${targetUser.username || 'yo\'q'})`);
  });

  bot.command('addadmin', async (ctx) => {
    await loadAdmins();
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q');

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 2) {
      return ctx.reply('ℹ️ Foydalanish: /addadmin 123456789 yoki /addadmin @username yoki /addadmin 939119572');
    }

    const raw = parts[1].trim();
    let targetUser = null;

    if (raw.startsWith('@')) {
      const username = raw.slice(1).toLowerCase();
      targetUser = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    } else if (/^\d+$/.test(raw)) {
      if (raw.length >= 9) {
        const phone = normalizePhoneInput(raw);
        if (phone) {
          targetUser = await User.findOne({ 'phones.phone': phone });
        }
      } else {
        const userId = Number(raw);
        targetUser = await User.findOne({ userId });
      }
    } else {
      const username = raw.toLowerCase();
      targetUser = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    }

    if (!targetUser) {
      return ctx.reply('❌ Foydalanuvchi topilmadi. Username yoki telefon raqamni tekshiring.');
    }
    if (!Number.isFinite(targetUser.userId)) {
      return ctx.reply('❌ Telegram ID topilmadi. Foydalanuvchi botdan /start qilgan bo\'lishi kerak.');
    }

    const added = await addAdmin(targetUser, ctx.from.id);
    if (!added) return ctx.reply('ℹ️ Bu foydalanuvchi allaqachon admin.');
    return ctx.reply(`✅ Admin qo'shildi: ${targetUser.userId} (@${targetUser.username || 'yo\'q'})`);
  });

  // ADMIN callback queries
  bot.action(/^process_(\d+)_(.+)$/, handleProcess);
  bot.action(/^sms_sent_(\d+)_(.+)$/, handleSmsSent);
  bot.action(/^confirm_(\d+)_(.+)$/, handleConfirm);
  bot.action(/^reject_(\d+)_(.+)$/, handleReject);
  bot.action(/^already_voted_(\d+)_(.+)$/, handleAlreadyVoted);

  // ADMIN komandalar
  bot.command('stats', adminStats);
  bot.command('pending', adminPending);

  bot.catch((err) => {
    console.error('❌ Admin bot xato:', err);
  });

  return bot;
}

module.exports = { createAdminBot };
