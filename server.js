const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('.'));

// === НАСТРОЙКИ ===const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('.'));

// === НАСТРОЙКИ ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBAPP_URL = 'https://bupsiapp.vercel.app';

const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: {
      timeout: 10
    }
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
const userStars = new Map(); // userId → stars
const userHistory = new Map(); // userId → [ { } ]
const exchangeSessions = new Map(); // sessionId → session

// Инициализация истории
const getHistory = (userId) => {
  if (!userHistory.has(userId)) userHistory.set(userId, []);
  return userHistory.get(userId);
};

const addHistory = (userId, type, text) => {
  const history = getHistory(userId);
  history.push({ type, text, date: new Date().toLocaleString('ru') });
  userHistory.set(userId, history);
};

// === Кэширование username → userId ===
bot.on('message', (msg) => {
  if (msg.from?.id && msg.from?.username) {
    const username = msg.from.username.toLowerCase();
    console.log(`[Кэш] @${username} → ${msg.from.id}`);
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

// === API: баланс звёзд ===
app.get('/api/stars/:userId', (req, res) => {
  const stars = userStars.get(parseInt(req.params.userId)) || 0;
  res.json({ stars });
});

// === API: история ===
app.get('/api/history/:userId', (req, res) => {
  const history = userHistory.get(parseInt(req.params.userId)) || [];
  res.json(history);
});

// === API: начать обмен по username ===
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
    console.error("getChat error:", err.response?.body || err.message);
    return res.json({ 
      success: false, 
      error: "Пользователь не найден. Убедитесь, что он писал боту /start" 
    });
  }

  // Проверим, можем ли мы писать этому пользователю
  try {
    await bot.sendMessage(toId, "❗ Это тест", { disable_notification: true });
    await bot.deleteMessage(toId, (await bot.sendMessage(toId, "Тест отправки")).message_id);
  } catch (err) {
    return res.json({ 
      success: false, 
      error: "Бот не может писать этому пользователю. Он должен начать диалог с ботом" 
    });
  }

  const sessionId = `ex_${Date.now()}`;

  exchangeSessions.set(sessionId, {
    fromId, toId, fromUsername: fromUsername || `user${fromId}`,
    status: 'pending', fromConfirmed: false, toConfirmed: false, giftFrom: null, giftTo: null
  });

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

    addHistory(fromId, 'exchange', `🔄 Начал обмен с @${cleanTarget}`);
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error("Send error:", err);
    res.json({ success: false, error: "Не удалось отправить приглашение" });
  }
});

// === Обработка кнопок ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  if (data.startsWith('decline_exchange_ex_')) {
    const sessionId = data.split('_').slice(2).join('_');
    const session = exchangeSessions.get(sessionId);
    if (!session) return;

    await bot.answerCallbackQuery(query.id);
    await bot.editMessageText('❌ Отклонено', { chat_id: chatId, message_id: query.message.message_id });
    await bot.sendMessage(session.fromId, `❌ Пользователь отклонил обмен.`);
    exchangeSessions.delete(sessionId);
  }

  if (data.startsWith('accept_exchange_ex_')) {
    const sessionId = data.split('_').slice(2).join('_');
    const session = exchangeSessions.get(sessionId);
    if (!session || session.toId !== chatId) return;

    session.toConfirmed = true;
    exchangeSessions.set(sessionId, session);

    await bot.answerCallbackQuery(query.id, { text: 'Принято!' });
    await bot.editMessageText(`✅ Вы приняли обмен с *${session.fromUsername}*!`, {
      chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown'
    });

    await bot.sendMessage(session.fromId, `✅ Приняли ваш запрос!`, {
      reply_markup: {
        inline_keyboard: [[{
          text: "✅ Подтвердить",
          web_app: { url: `${WEBAPP_URL}?startapp=${sessionId}` }
        }]]
      }
    });
  }
});

// === API: покупка в магазине ===
app.post('/api/buy-item', async (req, res) => {
  const { userId, item } = req.body;
  const cost = item.price;

  let stars = userStars.get(userId) || 0;
  if (stars < cost) return res.json({ success: false, error: "Недостаточно звёзд" });

  userStars.set(userId, stars - cost);
  addHistory(userId, 'shop', `🛒 Купил "${item.name}" за ${cost} ⭐`);

  await bot.sendMessage(userId, `🛍️ Куплено: *${item.name}*\n💸 Списано: ${cost} ⭐`, {
    parse_mode: 'Markdown'
  });

  res.json({ success: true });
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBAPP_URL = 'https://bupsiapp.vercel.app';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === CORS ===
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// === ХРАНИЛИЩЕ ===
const userStars = new Map(); // userId → stars
const userHistory = new Map(); // userId → [ { } ]
const exchangeSessions = new Map(); // sessionId → session

// Инициализация истории
const getHistory = (userId) => {
  if (!userHistory.has(userId)) userHistory.set(userId, []);
  return userHistory.get(userId);
};

const addHistory = (userId, type, text) => {
  const history = getHistory(userId);
  history.push({ type, text, date: new Date().toLocaleString('ru') });
  userHistory.set(userId, history);
};

// === Кэширование username → userId ===
bot.on('message', (msg) => {
  if (msg.from?.id && msg.from?.username) {
    const username = msg.from.username.toLowerCase();
    console.log(`[Кэш] @${username} → ${msg.from.id}`);
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

// === API: баланс звёзд ===
app.get('/api/stars/:userId', (req, res) => {
  const stars = userStars.get(parseInt(req.params.userId)) || 0;
  res.json({ stars });
});

// === API: история ===
app.get('/api/history/:userId', (req, res) => {
  const history = userHistory.get(parseInt(req.params.userId)) || [];
  res.json(history);
});

// === API: начать обмен по username ===
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
    console.error("getChat error:", err.response?.body || err.message);
    return res.json({ 
      success: false, 
      error: "Пользователь не найден. Убедитесь, что он писал боту /start" 
    });
  }

  // Проверим, можем ли мы писать этому пользователю
  try {
    await bot.sendMessage(toId, "❗ Это тест", { disable_notification: true });
    await bot.deleteMessage(toId, (await bot.sendMessage(toId, "Тест отправки")).message_id);
  } catch (err) {
    return res.json({ 
      success: false, 
      error: "Бот не может писать этому пользователю. Он должен начать диалог с ботом" 
    });
  }

  const sessionId = `ex_${Date.now()}`;

  exchangeSessions.set(sessionId, {
    fromId, toId, fromUsername: fromUsername || `user${fromId}`,
    status: 'pending', fromConfirmed: false, toConfirmed: false, giftFrom: null, giftTo: null
  });

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

    addHistory(fromId, 'exchange', `🔄 Начал обмен с @${cleanTarget}`);
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error("Send error:", err);
    res.json({ success: false, error: "Не удалось отправить приглашение" });
  }
});

// === Обработка кнопок ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  if (data.startsWith('decline_exchange_ex_')) {
    const sessionId = data.split('_').slice(2).join('_');
    const session = exchangeSessions.get(sessionId);
    if (!session) return;

    await bot.answerCallbackQuery(query.id);
    await bot.editMessageText('❌ Отклонено', { chat_id: chatId, message_id: query.message.message_id });
    await bot.sendMessage(session.fromId, `❌ Пользователь отклонил обмен.`);
    exchangeSessions.delete(sessionId);
  }

  if (data.startsWith('accept_exchange_ex_')) {
    const sessionId = data.split('_').slice(2).join('_');
    const session = exchangeSessions.get(sessionId);
    if (!session || session.toId !== chatId) return;

    session.toConfirmed = true;
    exchangeSessions.set(sessionId, session);

    await bot.answerCallbackQuery(query.id, { text: 'Принято!' });
    await bot.editMessageText(`✅ Вы приняли обмен с *${session.fromUsername}*!`, {
      chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown'
    });

    await bot.sendMessage(session.fromId, `✅ Приняли ваш запрос!`, {
      reply_markup: {
        inline_keyboard: [[{
          text: "✅ Подтвердить",
          web_app: { url: `${WEBAPP_URL}?startapp=${sessionId}` }
        }]]
      }
    });
  }
});

// === API: покупка в магазине ===
app.post('/api/buy-item', async (req, res) => {
  const { userId, item } = req.body;
  const cost = item.price;

  let stars = userStars.get(userId) || 0;
  if (stars < cost) return res.json({ success: false, error: "Недостаточно звёзд" });

  userStars.set(userId, stars - cost);
  addHistory(userId, 'shop', `🛒 Купил "${item.name}" за ${cost} ⭐`);

  await bot.sendMessage(userId, `🛍️ Куплено: *${item.name}*\n💸 Списано: ${cost} ⭐`, {
    parse_mode: 'Markdown'
  });

  res.json({ success: true });
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

