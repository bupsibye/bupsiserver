const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('.'));

// === НАСТРОЙКИ ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBAPP_URL = 'https://bupsiapp.vercel.app';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === ХРАНИЛИЩЕ (в реальности — заменить на базу) ===
const userStars = new Map(); // userId → stars
const userHistory = new Map(); // userId → [ { type, text, date } ]

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

// === Обработка платежей ===
bot.on('pre_checkout_query', (query) => {
  bot.answerPreCheckoutQuery(query.id, true);
});

bot.on('successful_payment', async (payment) => {
  const userId = payment.from.id;
  const stars = payment.total_amount; // количество звёзд

  let current = userStars.get(userId) || 0;
  userStars.set(userId, current + stars);

  // Добавляем в историю
  addHistory(userId, 'stars_in', `➕ Пополнение: ${stars} ⭐`);

  await bot.sendMessage(userId, `✅ Вы получили ${stars} ⭐!\n\nВаш баланс: ${current + stars} ⭐`);
});

// === История для Mini App ===
app.get('/api/history/:userId', (req, res) => {
  const history = userHistory.get(parseInt(req.params.userId)) || [];
  res.json(history);
});

// === Баланс звёзд ===
app.get('/api/stars/:userId', (req, res) => {
  const stars = userStars.get(parseInt(req.params.userId)) || 0;
  res.json({ stars });
});

// === Начать обмен (как было) ===
app.post('/api/start-exchange-by-username', async (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;
  const cleanTarget = targetUsername.replace(/^@/, '').toLowerCase();

  let toId;
  try {
    const chat = await bot.getChat(`@${cleanTarget}`);
    toId = chat.id;
  } catch (err) {
    return res.json({ success: false, error: "Пользователь не найден" });
  }

  const sessionId = `ex_${Date.now()}`;

  // Добавляем в историю
  addHistory(fromId, 'exchange', `🔄 Начал обмен с @${cleanTarget}`);

  res.json({ success: true, sessionId });
});

// === Покупка в магазине (пример) ===
app.post('/api/buy-item', (req, res) => {
  const { userId, item } = req.body;
  const cost = item.price;

  let stars = userStars.get(userId) || 0;
  if (stars < cost) {
    return res.json({ success: false, error: "Недостаточно звёзд" });
  }

  userStars.set(userId, stars - cost);
  addHistory(userId, 'shop', `🛒 Купил "${item.name}" за ${cost} ⭐`);

  res.json({ success: true, newStars: stars - cost });
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
