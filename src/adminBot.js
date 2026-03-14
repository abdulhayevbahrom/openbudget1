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
const { isAdmin, addAdmin, ensureFirstAdmin, loadAdmins, upsertAdminProfile } = require('./utils/adminStore');
const User = require('./models/User');

const pendingAddAdmin = new Set();

async function resolveTargetUser(raw) {
  let targetUser = null;
  let fallbackUserId = null;

  if (/^\d+$/.test(raw)) {
    const numId = Number(raw);
    if (Number.isFinite(numId)) {
      fallbackUserId = numId;
      targetUser = await User.findOne({ userId: numId });
    }
    return { targetUser, fallbackUserId };
  }
  return { targetUser, fallbackUserId };
}

function createAdminBot(token) {
  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    await loadAdmins();
    if (isAdmin(ctx.from.id)) {
      await upsertAdminProfile(ctx.from);
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
    pendingAddAdmin.add(ctx.from.id);
    return ctx.reply(
      `➕ Admin qo'shish uchun faqat chat ID yuboring.`
    );
  });

  bot.on('text', async (ctx) => {
    await loadAdmins();
    if (!isAdmin(ctx.from.id)) return;
    if (!pendingAddAdmin.has(ctx.from.id)) return;

    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const raw = text;
    const { targetUser, fallbackUserId } = await resolveTargetUser(raw);

    if (!Number.isFinite(fallbackUserId)) {
      return ctx.reply('❌ Noto\'g\'ri format. Faqat chat ID yuboring.');
    }
    pendingAddAdmin.delete(ctx.from.id);
    const addedById = await addAdmin({ userId: fallbackUserId }, ctx.from.id);
    if (!addedById) return ctx.reply('ℹ️ Bu foydalanuvchi allaqachon admin.');
    if (targetUser) {
      return ctx.reply(`✅ Admin qo'shildi: ${targetUser.userId} (@${targetUser.username || 'yo\'q'})`);
    }
    return ctx.reply(`✅ Admin qo'shildi: ${fallbackUserId}`);
  });

  bot.command('addadmin', async (ctx) => {
    await loadAdmins();
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q');

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 2) {
      return ctx.reply('ℹ️ Foydalanish: /addadmin 123456789');
    }

    const raw = parts[1].trim();
    const { targetUser, fallbackUserId } = await resolveTargetUser(raw);

    if (!Number.isFinite(fallbackUserId)) {
      return ctx.reply('❌ Noto\'g\'ri format. Faqat chat ID yuboring.');
    }
    const addedById = await addAdmin({ userId: fallbackUserId }, ctx.from.id);
    if (!addedById) return ctx.reply('ℹ️ Bu foydalanuvchi allaqachon admin.');
    if (targetUser) {
      return ctx.reply(`✅ Admin qo'shildi: ${targetUser.userId} (@${targetUser.username || 'yo\'q'})`);
    }
    return ctx.reply(`✅ Admin qo'shildi: ${fallbackUserId}`);
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
