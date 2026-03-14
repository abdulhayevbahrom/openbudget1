# 🗳 Ovoz Yig'ish Boti

Telegram orqali ovoz yig'ish uchun bot. Har bir tasdiqlangan raqam uchun **20,000 so'm**.

---

## 📦 O'rnatish

```bash
npm install
```

## ⚙️ Sozlash

`.env.example` faylini ko'chirib `.env` qiling:

```bash
cp .env.example .env
```

`.env` faylini to'ldiring:

```env
BOT_TOKEN=your_telegram_bot_token_here
MONGODB_URI=mongodb://localhost:27017/sorovnoma
ADMIN_IDS=123456789,987654321
```

- `BOT_TOKEN` — [@BotFather](https://t.me/BotFather) dan oling
- `MONGODB_URI` — MongoDB ulanish manzili
- `ADMIN_IDS` — Admin Telegram ID lari (vergul bilan ajrating)

## 🚀 Ishga tushirish

```bash
# Oddiy
npm start

# Development (auto-restart)
npm run dev
```

---

## 🔄 Jarayon ketma-ketligi

### Mijoz tomoni:
1. `/start` → salomlashadi, ID beriladi
2. Telefon raqam yuboradi (tugma yoki matn)
3. Bot admin ga xabar yuboradi
4. Admins "Jarayonga olish" bosadi → mijozga "Jarayonda" deydi
5. Admin SMS yuboradi platformada → "SMS yuborildi" bosadi → mijozga SMS kodi so'raladi
6. Mijoz SMS kodni botga yozadi → Admin platformaga kiritadi
7. Tasdiqlansa → ✅ mijozga xabar + hisobga 20,000 so'm
8. Rad etilsa → ❌ mijozga sabab

### Admin buyruqlari:
| Buyruq | Tavsif |
|--------|--------|
| `/admin` | Boshqaruv paneli |
| `/pending` | Kutilayotgan raqamlar |

---

## 🛡 Race Condition Himoyasi

Bir nechta admin bir vaqtda "Jarayonga olish" bosganida, faqat **birinchi admin** raqamni oladi. MongoDB atomic update (`findOneAndUpdate`) orqali ta'minlanadi.

---

## 📊 MongoDB Kolleksiyalar

### `users`
| Maydon | Tavsif |
|--------|--------|
| `userId` | 1 dan boshlanadigan ID |
| `telegramId` | Telegram ID |
| `username` | Telegram username |
| `firstName`, `lastName` | Ism familiya |

### `phones`
| Maydon | Tavsif |
|--------|--------|
| `telegramId` | Egasining Telegram ID si |
| `phone` | Raqam (+998...) |
| `status` | `pending` / `processing` / `sms_sent` / `confirmed` / `rejected` |
| `adminId` | Qaysi admin qabul qildi |
| `reward` | 20000 so'm |

---

## 💡 Qo'shimcha

- Bir mijoz nechta raqam qo'sha oladi (o'zi + oila azolari)
- Har bir tasdiqlangan raqam 20,000 so'm
- `/my_phones` yoki "📊 Mening raqamlarim" — barcha raqamlar va holatlari
