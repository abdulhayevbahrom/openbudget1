const { Phone, User } = require('./models');
const { isAdmin, statusLabel } = require('./helpers');

// Admin: barcha pending raqamlar ro'yxati
async function adminListPending(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const phones = await Phone.find({ status: 'pending' }).sort({ createdAt: 1 });
  if (!phones.length) return ctx.reply('📭 Kutilayotgan raqamlar yo\'q.');

  for (const p of phones) {
    const user = await User.findOne({ telegramId: p.telegramId });
    const name = user
      ? `${user.firstName || ''}${user.lastName ? ' ' + user.lastName : ''} (ID: ${user.userId})`
      : `TG: ${p.telegramId}`;

    await ctx.reply(
      `👤 <b>${name}</b>\n📞 Raqam: <code>${p.phone}</code>\n📅 ${p.createdAt.toLocaleString('uz-UZ')}\n🆔 Record: <code>${p._id}</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Jarayonga olish', callback_data: `take_${p._id}` }]
          ]
        }
      }
    );
  }
}

// Admin: /admin buyrug'i - boshqaruv paneli
async function adminPanel(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q.');

  const pending = await Phone.countDocuments({ status: 'pending' });
  const processing = await Phone.countDocuments({ status: 'processing' });
  const confirmed = await Phone.countDocuments({ status: 'confirmed' });
  const total = await Phone.countDocuments();

  await ctx.reply(
    `🛠 <b>Admin Panel</b>\n\n` +
    `🟡 Kutilmoqda: <b>${pending}</b>\n` +
    `🔄 Jarayonda: <b>${processing}</b>\n` +
    `✅ Tasdiqlangan: <b>${confirmed}</b>\n` +
    `📊 Jami: <b>${total}</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: `🟡 Kutilayotganlar (${pending})`, callback_data: 'admin_pending' }],
          [{ text: `🔄 Jarayondagilar (${processing})`, callback_data: 'admin_processing' }],
          [{ text: '📊 Statistika', callback_data: 'admin_stats' }]
        ]
      }
    }
  );
}

// Jarayondagi raqamlar ro'yxati (admin uchun)
async function adminListProcessing(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const phones = await Phone.find({
    status: 'processing',
    adminId: ctx.from.id
  }).sort({ updatedAt: -1 });

  const allProcessing = await Phone.find({ status: 'processing' });

  if (!allProcessing.length) return ctx.reply('📭 Jarayondagi raqamlar yo\'q.');

  for (const p of allProcessing) {
    const user = await User.findOne({ telegramId: p.telegramId });
    const name = user
      ? `${user.firstName || ''}${user.lastName ? ' ' + user.lastName : ''} (ID: ${user.userId})`
      : `TG: ${p.telegramId}`;

    const isMine = p.adminId === ctx.from.id;
    const adminLabel = isMine ? '(Siz)' : `(Admin: ${p.adminUsername || p.adminId})`;

    await ctx.reply(
      `👤 <b>${name}</b>\n📞 Raqam: <code>${p.phone}</code>\n${statusLabel(p.status)}\n👮 ${adminLabel}`,
      {
        parse_mode: 'HTML',
        reply_markup: isMine ? {
          inline_keyboard: [
            [{ text: '📩 SMS yuborildi', callback_data: `sms_sent_${p._id}` }],
            [{ text: '❌ Avval ovoz berilgan', callback_data: `reject_${p._id}` }]
          ]
        } : undefined
      }
    );
  }
}

// Callback handler-larni register qilish
function registerAdminCallbacks(bot) {

  // "Jarayonga olish" tugmasi — race condition oldini olish uchun atomic update
  bot.action(/^take_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

    const phoneId = ctx.match[1];

    // Atomic: faqat 'pending' bo'lsa o'zgartir, boshqa admin olgani bo'lsa xato
    const updated = await Phone.findOneAndUpdate(
      { _id: phoneId, status: 'pending' },
      {
        status: 'processing',
        adminId: ctx.from.id,
        adminUsername: ctx.from.username || ctx.from.first_name,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updated) {
      return ctx.answerCbQuery('⚠️ Bu raqam allaqachon boshqa admin tomonidan olingan!', { show_alert: true });
    }

    await ctx.answerCbQuery('✅ Jarayonga oldingiz');
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [{ text: '📩 SMS yuborildi', callback_data: `sms_sent_${phoneId}` }],
        [{ text: '❌ Avval ovoz berilgan', callback_data: `reject_${phoneId}` }]
      ]
    });

    // Mijozga xabar
    await bot.telegram.sendMessage(
      updated.telegramId,
      `🔄 <b>${updated.phone}</b> raqamingiz hozir jarayonda.\n\nKuting, tez orada SMS yuboramiz.`,
      { parse_mode: 'HTML' }
    );

    await ctx.reply(`✅ <b>${updated.phone}</b> raqami jarayonga olindi.`, { parse_mode: 'HTML' });
  });

  // "SMS yuborildi" tugmasi
  bot.action(/^sms_sent_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

    const phoneId = ctx.match[1];
    const phone = await Phone.findOneAndUpdate(
      { _id: phoneId, status: 'processing', adminId: ctx.from.id },
      { status: 'sms_sent', updatedAt: new Date() },
      { new: true }
    );

    if (!phone) return ctx.answerCbQuery('⚠️ Topilmadi yoki siz emas', { show_alert: true });

    await ctx.answerCbQuery('📩 SMS yuborildi deb belgilandi');
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [{ text: '✅ Tasdiqlandi', callback_data: `confirm_${phoneId}` }],
        [{ text: '❌ Avval ovoz berilgan', callback_data: `reject_${phoneId}` }]
      ]
    });

    // Mijozga xabar
    await bot.telegram.sendMessage(
      phone.telegramId,
      `📩 <b>${phone.phone}</b> raqamingizga SMS-kod yuborildi.\n\nIltimos, SMS-kodni quyida yuboring 👇`,
      { parse_mode: 'HTML' }
    );
  });

  // "Tasdiqlandi" tugmasi
  bot.action(/^confirm_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

    const phoneId = ctx.match[1];
    const phone = await Phone.findOneAndUpdate(
      { _id: phoneId, status: 'sms_sent', adminId: ctx.from.id },
      { status: 'confirmed', updatedAt: new Date() },
      { new: true }
    );

    if (!phone) return ctx.answerCbQuery('⚠️ Topilmadi', { show_alert: true });

    // Jami tasdiqlangan raqamlar sonini hisoblash
    const confirmedCount = await Phone.countDocuments({
      telegramId: phone.telegramId,
      status: 'confirmed'
    });
    const totalReward = confirmedCount * 20000;

    await ctx.answerCbQuery('✅ Tasdiqlandi!');
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n✅ <b>TASDIQLANDI</b>',
      { parse_mode: 'HTML' }
    );

    // Mijozga xabar
    await bot.telegram.sendMessage(
      phone.telegramId,
      `🎉 <b>${phone.phone}</b> raqamingiz muvaffaqiyatli tasdiqlandi!\n\n` +
      `💰 Bu raqam uchun: <b>20,000 so'm</b>\n` +
      `💼 Jami hisobingiz: <b>${totalReward.toLocaleString()} so'm</b>\n\n` +
      `Adminlar tez orada karta raqamingizga pul o'tkazishadi.`,
      { parse_mode: 'HTML' }
    );
  });

  // "Avval ovoz berilgan (rad etish)" tugmasi
  bot.action(/^reject_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

    const phoneId = ctx.match[1];
    const phone = await Phone.findOneAndUpdate(
      { _id: phoneId, adminId: ctx.from.id },
      { status: 'rejected', updatedAt: new Date() },
      { new: true }
    );

    if (!phone) return ctx.answerCbQuery('⚠️ Topilmadi', { show_alert: true });

    await ctx.answerCbQuery('❌ Rad etildi');
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n❌ <b>RAD ETILDI</b>',
      { parse_mode: 'HTML' }
    );

    // Mijozga xabar
    await bot.telegram.sendMessage(
      phone.telegramId,
      `❌ <b>${phone.phone}</b> raqamingiz tasdiqlanmadi.\n\nSabab: Bu raqam orqali avval ovoz berilgan.\n\nBoshqa raqam qo'shmoqchi bo'lsangiz /add_phone buyrug'ini bosing.`,
      { parse_mode: 'HTML' }
    );
  });

  // Admin pending list
  bot.action('admin_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌');
    await ctx.answerCbQuery();
    await adminListPending(ctx);
  });

  // Admin processing list
  bot.action('admin_processing', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌');
    await ctx.answerCbQuery();
    await adminListProcessing(ctx);
  });

  // Admin stats
  bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌');
    await ctx.answerCbQuery();

    const totalUsers = await User.countDocuments();
    const totalPhones = await Phone.countDocuments();
    const confirmed = await Phone.countDocuments({ status: 'confirmed' });
    const pending = await Phone.countDocuments({ status: 'pending' });
    const processing = await Phone.countDocuments({ status: 'processing' });
    const rejected = await Phone.countDocuments({ status: 'rejected' });
    const totalPayout = confirmed * 20000;

    await ctx.reply(
      `📊 <b>To'liq Statistika</b>\n\n` +
      `👥 Jami foydalanuvchilar: <b>${totalUsers}</b>\n` +
      `📱 Jami raqamlar: <b>${totalPhones}</b>\n\n` +
      `🟡 Kutilmoqda: <b>${pending}</b>\n` +
      `🔄 Jarayonda: <b>${processing}</b>\n` +
      `✅ Tasdiqlangan: <b>${confirmed}</b>\n` +
      `❌ Rad etilgan: <b>${rejected}</b>\n\n` +
      `💰 Jami to'lov: <b>${totalPayout.toLocaleString()} so'm</b>`,
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = { adminPanel, adminListPending, registerAdminCallbacks };
