const { Markup } = require('telegraf');
const User = require('../models/User');
const { statusText, REWARD_PER_VOTE, formatPhoneDisplay } = require('../utils/helpers');
const { isAdmin } = require('../utils/adminStore');
const { sendToUser } = require('../utils/userNotifier');

const NEXT_PROMPT = `\n\n📱 Qo'shimcha raqam kiritish uchun raqamni yuboring.`;

/**
 * Admin callback: 🔄 Jarayonga olish
 * process_{userId}_{phone}
 */
async function handleProcess(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

  const [, userId, phone] = ctx.callbackQuery.data.split('_');

  const user = await User.findOne({ userId: parseInt(userId) });
  if (!user) return ctx.answerCbQuery('❌ Foydalanuvchi topilmadi');

  const phoneEntry = user.phones.find(p => p.phone === phone);
  if (!phoneEntry) return ctx.answerCbQuery('❌ Raqam topilmadi');

  // Faqat pending holatdagini olsa bo'ladi (race condition himoya)
  if (phoneEntry.status !== 'pending') {
    return ctx.answerCbQuery(`⚠️ Bu raqam allaqachon: ${statusText(phoneEntry.status)}`);
  }

  // Atomik yangilash — boshqa admin olmaslik uchun
  const updated = await User.findOneAndUpdate(
    {
      userId: parseInt(userId),
      'phones.phone': phone,
      'phones.status': 'pending', // faqat pending bo'lsa yangilanadi
    },
    {
      $set: {
        'phones.$.status': 'processing',
        'phones.$.adminId': String(ctx.from.id),
      }
    },
    { new: true }
  );

  if (!updated) {
    return ctx.answerCbQuery('⚠️ Bu raqam boshqa admin tomonidan allaqachon olingan!');
  }

  await ctx.answerCbQuery('✅ Jarayonga olindi');

  // Xabarni yangilash
  const adminName = ctx.from.first_name || 'Admin';
  await ctx.editMessageText(
    ctx.callbackQuery.message.text + `\n\n🔄 <b>Jarayonga oldi:</b> ${adminName}`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📨 SMS yuborildi', `sms_sent_${userId}_${phone}`)],
        [Markup.button.callback('⚠️ Avval ovoz berilgan', `already_voted_${userId}_${phone}`)],
      ])
    }
  );

  // Mijozga xabar
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  await sendToUser(
    user.userId,
    `🔄 Raqamingiz (<code>${phone}</code>) jarayonga olindi.\n` +
    `⏳ Iltimos, kuting...` +
    NEXT_PROMPT,
    { parse_mode: 'HTML' }
  );
}

/**
 * Admin callback: 📨 SMS yuborildi
 * sms_sent_{userId}_{phone}
 */
async function handleSmsSent(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

  const [, , userId, phone] = ctx.callbackQuery.data.split('_');

  const updated = await User.findOneAndUpdate(
    {
      userId: parseInt(userId),
      'phones.phone': phone,
    },
    {
      $set: {
        'phones.$.status': 'sms_sent',
        currentPhone: phone,
        state: 'waiting_sms',
      }
    },
    { new: true }
  );

  if (!updated) return ctx.answerCbQuery('❌ Foydalanuvchi topilmadi');

  await ctx.answerCbQuery('📨 SMS yuborildi belgisi o\'rnatildi');

  await ctx.editMessageText(
    ctx.callbackQuery.message.text + `\n\n📨 SMS yuborildi`,
    { parse_mode: 'HTML' }
  );

  // Mijozga xabar
  await sendToUser(
    parseInt(userId),
    `📨 <b>SMS kod yuborildi!</b>\n\n` +
    `📱 Raqam: <code>${phone}</code>\n\n` +
    `Telefoningizga kelgan <b>SMS kodni</b> shu yerga yuboring:`,
    { parse_mode: 'HTML' }
  );
}

/**
 * Admin callback: ✅ Tasdiqlandi
 * confirm_{userId}_{phone}
 */
async function handleConfirm(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

  const [, userId, phone] = ctx.callbackQuery.data.split('_');

  const user = await User.findOneAndUpdate(
    {
      userId: parseInt(userId),
      'phones.phone': phone,
    },
    {
      $set: {
        'phones.$.status': 'confirmed',
        'phones.$.confirmedAt': new Date(),
        state: null,
        currentPhone: null,
      },
      $inc: { totalEarned: REWARD_PER_VOTE }
    },
    { new: true }
  );

  if (!user) return ctx.answerCbQuery('❌ Topilmadi');

  await ctx.answerCbQuery('✅ Tasdiqlandi');

  const confirmed = user.phones.filter(p => p.status === 'confirmed').length;
  await ctx.editMessageText(
    ctx.callbackQuery.message.text + `\n\n✅ <b>TASDIQLANDI</b>`,
    { parse_mode: 'HTML' }
  );

  // Mijozga xabar
  await sendToUser(
    parseInt(userId),
    `🎉 <b>Tabriklaymiz!</b>\n\n` +
    `✅ Raqam tasdiqlandi: <code>${phone}</code>\n` +
    `💰 Hisobingizga <b>${REWARD_PER_VOTE.toLocaleString()} so'm</b> qo'shildi!\n\n` +
    `📊 Jami: <b>${(confirmed * REWARD_PER_VOTE).toLocaleString()} so'm</b> (${confirmed} ta raqam)\n\n` +
    `Yana raqam yubormoqchi bo'lsangiz, shunchaki shu yerga yozing.` +
    NEXT_PROMPT,
    {
      parse_mode: 'HTML',
      ...Markup.keyboard([
        ['📊 Mening hisobim'],
      ]).resize()
    }
  );
}

/**
 * Admin callback: ❌ Rad etildi
 * reject_{userId}_{phone}
 */
async function handleReject(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

  const [, userId, phone] = ctx.callbackQuery.data.split('_');

  await User.findOneAndUpdate(
    {
      userId: parseInt(userId),
      'phones.phone': phone,
    },
    {
      $set: {
        'phones.$.status': 'rejected',
        state: null,
        currentPhone: null,
      }
    }
  );

  await ctx.answerCbQuery('❌ Rad etildi');

  await ctx.editMessageText(
    ctx.callbackQuery.message.text + `\n\n❌ <b>RAD ETILDI</b>`,
    { parse_mode: 'HTML' }
  );

  // Mijozga xabar
  await sendToUser(
    parseInt(userId),
    `❌ <b>Afsuski, raqam rad etildi.</b>\n\n` +
    `📱 Raqam: <code>${phone}</code>\n\n` +
    `Boshqa raqam yubormoqchi bo'lsangiz, shunchaki shu yerga yozing.` +
    NEXT_PROMPT,
    {
      parse_mode: 'HTML',
      ...Markup.keyboard([
        ['📊 Mening hisobim'],
      ]).resize()
    }
  );
}

/**
 * Admin callback: ⚠️ Avval ovoz berilgan
 * already_voted_{userId}_{phone}
 */
async function handleAlreadyVoted(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

  const parts = ctx.callbackQuery.data.split('_');
  // already_voted_{userId}_{phone} → 4 qism
  const userId = parts[2];
  const phone = parts[3];

  await User.findOneAndUpdate(
    {
      userId: parseInt(userId),
      'phones.phone': phone,
    },
    {
      $set: {
        'phones.$.status': 'rejected',
        state: null,
        currentPhone: null,
      }
    }
  );

  await ctx.answerCbQuery('⚠️ Belgilandi');

  await ctx.editMessageText(
    ctx.callbackQuery.message.text + `\n\n⚠️ <b>AVVAL OVOZ BERILGAN</b>`,
    { parse_mode: 'HTML' }
  );

  // Mijozga xabar
  await sendToUser(
    parseInt(userId),
    `⚠️ <b>Bu raqamdan avval ovoz berilgan!</b>\n\n` +
    `📱 Raqam: <code>${phone}</code>\n\n` +
    `Har bir raqamdan faqat 1 marta ovoz berish mumkin.\n` +
    `Boshqa raqam yubormoqchi bo'lsangiz, shunchaki shu yerga yozing.` +
    NEXT_PROMPT,
    {
      parse_mode: 'HTML',
      ...Markup.keyboard([
        ['📊 Mening hisobim'],
      ]).resize()
    }
  );
}

/**
 * Admin /stats komandasi
 */
async function adminStats(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const totalUsers = await User.countDocuments();
  const allUsers = await User.find();

  let pending = 0, processing = 0, smsSent = 0, confirmed = 0, rejected = 0;

  allUsers.forEach(u => {
    u.phones.forEach(p => {
      if (p.status === 'pending') pending++;
      else if (p.status === 'processing') processing++;
      else if (p.status === 'sms_sent') smsSent++;
      else if (p.status === 'confirmed') confirmed++;
      else if (p.status === 'rejected') rejected++;
    });
  });

  const totalPayout = confirmed * REWARD_PER_VOTE;

  await ctx.reply(
    `📊 <b>STATISTIKA</b>\n\n` +
    `👥 Jami foydalanuvchilar: <b>${totalUsers}</b>\n\n` +
    `📱 Raqamlar holati:\n` +
    `⏳ Kutilmoqda: <b>${pending}</b>\n` +
    `🔄 Jarayonda: <b>${processing}</b>\n` +
    `📨 SMS yuborildi: <b>${smsSent}</b>\n` +
    `✅ Tasdiqlandi: <b>${confirmed}</b>\n` +
    `❌ Rad etildi: <b>${rejected}</b>\n\n` +
    `💰 Jami to'lov: <b>${totalPayout.toLocaleString()} so'm</b>`,
    { parse_mode: 'HTML' }
  );
}

/**
 * Admin /pending — kutayotgan raqamlar
 */
async function adminPending(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const users = await User.find({ 'phones.status': 'pending' });

  if (users.length === 0) {
    return ctx.reply('✅ Kutayotgan raqam yo\'q.');
  }

  for (const user of users) {
    const pendingPhones = user.phones.filter(p => p.status === 'pending');
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

    for (const phoneEntry of pendingPhones) {
      const displayPhone = phoneEntry.displayPhone || formatPhoneDisplay(phoneEntry.phone, true);
      await ctx.reply(
        `⏳ <b>KUTMOQDA</b>\n\n` +
        `👤 ${fullName} (@${user.username || 'yo\'q'}) #${user.sequentialId}\n` +
        `📱 <code>${displayPhone}</code>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Jarayonga olish', `process_${user.userId}_${phoneEntry.phone}`)],
            [Markup.button.callback('⚠️ Avval ovoz berilgan', `already_voted_${user.userId}_${phoneEntry.phone}`)],
          ])
        }
      );
    }
  }
}

module.exports = {
  handleProcess,
  handleSmsSent,
  handleConfirm,
  handleReject,
  handleAlreadyVoted,
  adminStats,
  adminPending,
};
