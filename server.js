const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// === Парсим JSON ===
app.use(express.json());

// === CORS: разрешаем Telegram и Vercel ===
const allowedOrigins = [
  'https://t.me',
  'https://web.telegram.org',
  'https://bupsiapp.vercel.app'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static('.'));

// === Переменные ===
const BOT_TOKEN = process.env.BOT_TOKEN || '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const SERVER_URL = process.env.SERVER_URL || 'https://bupsiserver.onrender.com';
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

console.log("✅ BOT_TOKEN:", BOT_TOKEN);
console.log("✅ SERVER_URL:", SERVER_URL);
console.log("✅ PORT:", PORT);

// === Webhook URL ===
const webhookUrl = `${SERVER_URL}/${BOT_TOKEN}`;

// === Обработка обновлений от Telegram ===
app.post(`/${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === ПРОВЕРКА: API живо? ===
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: "API живо" });
});

// === Проверка Webhook ===
app.get('/webhook-info', async (req, res) => {
  try {
    const info = await bot.getWebHookInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === ОБРАБОТЧИК /start — СОХРАНЯЕМ ПОЛЬЗОВАТЕЛЯ ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || `user${chatId}`;
  console.log("📩 /start от:", chatId, username);

  // ✅ Сохраняем пользователя при первом входе
  let user = users.get(chatId);
  if (!user) {
    users.set(chatId, { stars: 0, username });
  }

  const startParam = msg.text.split(' ')[1];

  if (startParam?.startsWith('exchange_')) {
    bot.sendMessage(chatId, `
🔄 Обмен начат!

Кто-то хочет обменяться с тобой ⭐

👉 Нажми кнопку ниже, чтобы принять.
    `, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Открыть App", web_app: { url: "https://t.me/knoxway_bot/app" } }]
        ]
      }
    });
  } else {
    bot.sendMessage(chatId, `
👋 Привет! Добро пожаловать в *Bupsi*!

Здесь ты можешь:
- 💬 Обмениваться ⭐ с друзьями
- 🎁 Покупать и дарить подарки
- 📊 Повышать свой статус

Нажми кнопку ниже, чтобы начать:
    `, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "Открыть App", web_app: { url: "https://t.me/knoxway_bot/app" } }]
        ]
      }
    });
  }
});

// === ВРЕМЕННОЕ ХРАНИЛИЩЕ ===
const users = new Map(); // ← Ключ: userId
const exchanges = new Map();
const history = [];

// === API: Баланс ===
app.get('/api/stars/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ error: "Неверный ID" });

  let user = users.get(userId);
  if (!user) {
    user = { stars: 0, username: `user${userId}` };
    users.set(userId, user);
  }

  res.json({ stars: user.stars });
});

// === API: Начать обмен ===
app.post('/api/start-exchange-by-username', async (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;

  if (!fromId || !fromUsername || !targetUsername) {
    return res.json({ success: false, error: "Недостаточно данных" });
  }

  // Ищем пользователя по username
  let toId = null;
  let toUser = null;

  for (const [id, user] of users) {
    if (user.username === targetUsername) {
      toId = id;
      toUser = user;
      break;
    }
  }

  if (!toId) {
    return res.json({ success: false, error: "Пользователь не найден или не писал боту" });
  }

  const stars = 50;
  const sessionId = `ex_${Date.now()}_${fromId}`;

  exchanges.set(sessionId, {
    fromId,
    toId,
    stars,
    status: 'pending',
    timestamp: Date.now()
  });

  try {
    await bot.sendMessage(toId, `
🔄 Запрос на обмен!

От: @${fromUsername}
Сумма: ${stars} ⭐

👉 Нажми кнопку ниже, чтобы принять.
    `, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Принять обмен", web_app: { url: `https://t.me/knoxway_bot/app?startapp=exchange_${sessionId}` } }]
        ]
      }
    });

    history.push({
      userId: fromId,
      type: 'exchange_pending',
      description: `Запрос на обмен ${stars} ⭐ пользователю @${targetUsername}`,
      date: new Date().toISOString()
    });

    res.json({ success: true, sessionId });
  } catch (err) {
    console.error("❌ Ошибка отправки:", err.response?.body?.description || err.message);
    res.json({ success: false, error: "Не удалось отправить запрос. Пользователь не писал боту." });
  }
});

// === API: Принять обмен ===
app.get('/api/accept-exchange/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const exchange = exchanges.get(sessionId);

  if (!exchange || exchange.status !== 'pending') {
    return res.json({ success: false, error: "Сессия не найдена или уже обработана" });
  }

  const fromUser = users.get(exchange.fromId);
  const toUser = users.get(exchange.toId);

  if (!fromUser || !toUser || fromUser.stars < exchange.stars) {
    return res.json({ success: false, error: "Ошибка: недостаточно средств или пользователь не найден" });
  }

  fromUser.stars -= exchange.stars;
  toUser.stars += exchange.stars;
  exchange.status = 'accepted';

  history.push({
    userId: exchange.fromId,
    type: 'stars_out',
    description: `Отправлено ${exchange.stars} ⭐ пользователю @${toUser.username}`,
    date: new Date().toISOString()
  });

  history.push({
    userId: exchange.toId,
    type: 'stars_in',
    description: `Получено ${exchange.stars} ⭐ от @${fromUser.username}`,
    date: new Date().toISOString()
  });

  await bot.sendMessage(exchange.fromId, `✅ Обмен принят! Вы отправили ${exchange.stars} ⭐`);
  await bot.sendMessage(exchange.toId, `✅ Обмен завершён! Вы получили ${exchange.stars} ⭐`);

  res.json({ success: true, stars: toUser.stars });
});

// === API: История ===
app.get('/api/history/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ error: "Неверный ID" });

  const userHistory = history
    .filter(h => h.userId === userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 50);

  res.json(userHistory);
});

// === API: Диалог подтверждён ===
app.get('/api/hello/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  try {
    await bot.sendMessage(userId, "✅ Диалог подтверждён — всё работает!", { parse_mode: 'Markdown' });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: "Напишите /start боту" });
  }
});

// === ЗАПУСК СЕРВЕРА И УСТАНОВКА WEBHOOK ===
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);

  setTimeout(async () => {
    try {
      await bot.setWebHook(webhookUrl);
      console.log(`✅ Webhook УСПЕШНО установлен: ${webhookUrl}`);
    } catch (err) {
      console.error('❌ Ошибка установки Webhook:', err.response?.body?.description || err.message);
    }
  }, 3000);
});
