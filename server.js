const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('.'));

// === ТОКЕН ===
const BOT_TOKEN = process.env.BOT_TOKEN || '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: { timeout: 10 }
  }
});

// === CORS ===
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// === ХРАНИЛИЩЕ ===
const userStars = new Map();
const userHistory = new Map();

const getHistory = (userId) => {
  if (!userHistory.has(userId)) userHistory.set(userId, []);
  return userHistory.get(userId);
};

const addHistory = (userId, type, text) => {
  const history = getHistory(userId);
  history.push({ type, text, date: new Date().toLocaleString('ru') });
  userHistory.set(userId, history);
};

// === API: баланс ===
app.get('/api/stars/:userId', (req, res) => {
  const stars = userStars.get(parseInt(req.params.userId)) || 0;
  res.json({ stars });
});

// === API: история ===
app.get('/api/history/:userId', (req, res) => {
  const history = userHistory.get(parseInt(req.params.userId)) || [];
  res.json(history);
});

// === API: обмен ===
app.post('/api/start-exchange-by-username', async (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;
  const cleanTarget = targetUsername.replace(/^@/, '').toLowerCase();

  if (!cleanTarget || cleanTarget === (fromUsername || `user${fromId}`).toLowerCase()) {
    return res.json({ success: false, error: "Неверный username" });
  }

  let toId;
  try {
    const chat = await bot.getChat(`@${cleanTarget}`);
    toId = chat.id;
  } catch (err) {
    return res.json({ 
      success: false, 
      error: "Пользователь не найден. Убедитесь, что он писал /start боту" 
    });
  }

  try {
    await bot.sendMessage(toId, "Тест", { disable_notification: true });
    await bot.deleteMessage(toId, (await bot.sendMessage(toId, "Тест отправки")).message_id);
  } catch (err) {
    return res.json({ 
      success: false, 
      error: "Бот не может писать этому пользователю" 
    });
  }

  const sessionId = `ex_${Date.now()}`;
  addHistory(fromId, 'exchange', `🔄 Начал обмен с @${cleanTarget}`);

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Принять", callback_data: `accept_exchange_${sessionId}` },
        { text: "❌ Отклонить", callback_data: `decline_exchange_${sessionId}` }
      ]
    ]
  };

  try {
    await bot.sendMessage(toId, `📩 *${fromUsername || 'Пользователь'}* предлагает обмен!`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    res.json({ success: true, sessionId });
  } catch (err) {
    res.json({ success: false, error: "Не удалось отправить приглашение" });
  }
});

// === Обработка платежей ===
bot.on('pre_checkout_query', (query) => {
  bot.answerPreCheckoutQuery(query.id, true);
});

bot.on('successful_payment', async (payment) => {
  const userId = payment.from.id;
  const stars = payment.total_amount;

  let current = userStars.get(userId) || 0;
  userStars.set(userId, current + stars);
  addHistory(userId, 'stars_in', `➕ Пополнение: ${stars} ⭐`);

  await bot.sendMessage(userId, `✅ Вы получили ${stars} ⭐!\n\nБаланс: ${current + stars} ⭐`);
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📌 BOT_TOKEN: ${BOT_TOKEN.substring(0, 10)}...`);
});
