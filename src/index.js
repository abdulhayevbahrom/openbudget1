require('dotenv').config();
const mongoose = require('mongoose');
const { createUserBot } = require('./userBot');
const { createAdminBot } = require('./adminBot');
const { loadAdmins } = require('./utils/adminStore');
const { setAdminBot } = require('./utils/adminNotifier');
const { setUserBot } = require('./utils/userNotifier');

// MongoDB ulanish
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB ulandi'))
  .catch(err => { console.error('❌ MongoDB xato:', err); process.exit(1); });

const userToken = process.env.BOT_TOKEN_USER || process.env.BOT_TOKEN;
const adminToken = process.env.BOT_TOKEN_ADMIN;

if (!userToken) {
  console.error('❌ BOT_TOKEN_USER yo\'q');
  process.exit(1);
}
if (!adminToken) {
  console.error('❌ BOT_TOKEN_ADMIN yo\'q');
  process.exit(1);
}

const userBot = createUserBot(userToken);
const adminBot = createAdminBot(adminToken);
setAdminBot(adminBot);
setUserBot(userBot);

loadAdmins()
  .then(() => console.log('✅ Adminlar yuklandi'))
  .catch(err => console.error('❌ Adminlarni yuklashda xato:', err));

userBot.launch()
  .then(() => console.log('🤖 User bot ishga tushdi!'))
  .catch(err => { console.error('❌ User bot xato:', err); process.exit(1); });

adminBot.launch()
  .then(() => console.log('🛡️ Admin bot ishga tushdi!'))
  .catch(err => { console.error('❌ Admin bot xato:', err); process.exit(1); });

process.once('SIGINT', () => {
  userBot.stop('SIGINT');
  adminBot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  userBot.stop('SIGTERM');
  adminBot.stop('SIGTERM');
});
