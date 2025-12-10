const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// === Парсим JSON и статика ===
app.use(express.json());
app.use(express.static('.'));

// === CORS ===
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
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// === Переменные ===
const BOT_TOKEN = process.env.BOT_TOKEN || '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const SERVER_URL = process.env.SERVER_URL || 'https://bupsiserver.onrender.com';
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// === Webhook ===
const webhookUrl = `${SERVER_URL}/${BOT_TOKEN}`;
app.post(`/${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === ХРАНИЛИЩЕ ===
const users = new Map(); // chatId → { stars, username }
const gifts = new Map(); // giftId → { id, name, ownerId, inExchange }
const exchanges = new Map(); // sessionId → { fromId, toId, stars, status }
const exchangeSessions = new Map(); // sessionId → { fromId, toId, fromGiftId, toGiftId, fromConfirmed, toConfirmed }
const history = [];

let giftIdCounter = 1;

// === ЗАПУСК ===
app.listen(PORT, async () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  await bot.setWebHook(webhookUrl);
  console.log(`✅ Webhook установлен: ${webhookUrl}`);
});

// === /start — приветствие + обработка startapp ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || `user${chatId}`;
  const startParam = msg.text.split(' ')[1];

  if (!users.has(chatId)) {
    users.set(chatId, { stars: 0, username });
  }

  let messageText, buttonText, buttonUrl;

  if (startParam?.startsWith('exchange_')) {
    messageText = `
🔄 Обмен начат!

Кто-то хочет обменяться с тобой ⭐

👉 Нажми кнопку ниже, чтобы принять.
    `;
    buttonText = "Принять обмен";
    buttonUrl = `https://bupsiapp.vercel.app?startapp=${startParam}`;
  } else {
    messageText = `
👋 Привет! Добро пожаловать в *Bupsi*!

Здесь ты можешь:
- 💬 Обмениваться ⭐ с друзьями
- 🎁 Покупать и дарить подарки
- 📊 Повышать свой статус

Нажми кнопку ниже, чтобы начать:
    `;
    buttonText = "Открыть App";
    buttonUrl = "https://bupsiapp.vercel.app";
  }

  bot.sendMessage(chatId, messageText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: buttonText, web_app: { url: buttonUrl } }]
      ]
    }
  }).catch(err => {
    console.error(`❌ Ошибка /start:`, err.response?.body?.description);
  });
});

// === Обработка: отклонение обмена звёзд/подарков ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  if (data.startsWith('decline_exchange_')) {
    const sessionId = data.split('_')[2];
    const session = exchangeSessions.get(sessionId) || exchanges.get(sessionId);
    if (!session || session.toId !== chatId) return;

    session.status = 'declined';

    await bot.answerCallbackQuery(query.id, { text: 'Вы отклонили обмен' });
    await bot.sendMessage(session.fromId, `❌ @${session.toUsername || 'Пользователь'} отказался от обмена`);
    await bot.editMessageText('❌ Обмен отклонён.', {
      chat_id: chatId,
      message_id: query.message.message_id
    });
  }
});

// === API: баланс звёзд ===
app.get('/api/stars/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const user = users.get(userId) || { stars: 0, username: `user${userId}` };
  res.json({ stars: user.stars });
});

// === API: история ===
app.get('/api/history/:userId', (req, res) => {
  const userHistory = history
    .filter(h => h.userId == req.params.userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 50);
  res.json(userHistory);
});

// === API: начать обмен звёздами ===
app.post('/api/start-exchange-by-username', async (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;
  if (!fromId || !fromUsername || !targetUsername) return res.json({ success: false });

  let toId = null;
  for (const [id, user] of users) {
    if (user.username === targetUsername) {
      toId = id;
      break;
    }
  }
  if (!toId) return res.json({ success: false, error: "Пользователь не найден" });

  const sessionId = `ex_${Date.now()}_${fromId}`;
  exchanges.set(sessionId, {
    fromId, toId, stars: 50, status: 'pending', fromUsername, toUsername: targetUsername
  });

  try {
    await bot.sendMessage(toId, `
🔄 Запрос на обмен!

От: @${fromUsername}
Сумма: 50 ⭐

👉 Примите или отклоните:
    `, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Принять", web_app: { url: `https://bupsiapp.vercel.app?startapp=exchange_${sessionId}` } },
            { text: "❌ Отклонить", callback_data: `decline_exchange_${sessionId}` }
          ]
        ]
      }
    });

    history.push({
      userId: fromId,
      type: 'exchange_pending',
      description: `Запрос на обмен 50 ⭐ пользователю @${targetUsername}`,
      date: new Date().toISOString()
    });

    res.json({ success: true, sessionId });
  } catch (err) {
    res.json({ success: false });
  }
});

// === API: принять обмен звёздами ===
app.get('/api/accept-exchange/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const exchange = exchanges.get(sessionId);
  if (!exchange || exchange.status !== 'pending') return res.json({ error: "Сессия недействительна" });

  const fromUser = users.get(exchange.fromId);
  const toUser = users.get(exchange.toId);
  if (!fromUser || !toUser || fromUser.stars < exchange.stars) return res.json({ error: "Ошибка" });

  fromUser.stars -= exchange.stars;
  toUser.stars += exchange.stars;
  exchange.status = 'accepted';

  history.push({
    userId: exchange.fromId,
    type: 'stars_out',
    description: `Отправлено 50 ⭐ пользователю @${toUser.username}`,
    date: new Date().toISOString()
  });
  history.push({
    userId: exchange.toId,
    type: 'stars_in',
    description: `Получено 50 ⭐ от @${fromUser.username}`,
    date: new Date().toISOString()
  });

  await bot.sendMessage(exchange.fromId, `✅ Обмен принят! Вы отправили 50 ⭐`);
  await bot.sendMessage(exchange.toId, `✅ Обмен завершён! Вы получили 50 ⭐`);

  res.json({ success: true });
});

// === API: подарки ===
app.post('/api/add-gift', (req, res) => {
  const { userId, name } = req.body;
  const giftId = giftIdCounter++;
  gifts.set(giftId, {
    id: giftId,
    name,
    ownerId: Number(userId),
    inExchange: false
  });
  res.json({ success: true, giftId });
});

app.get('/api/user-gifts/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const userGifts = [...gifts.values()].filter(g => g.ownerId === userId && !g.inExchange);
  res.json(userGifts);
});

// === API: обмен подарками ===
app.post('/api/start-exchange-gifts', async (req, res) => {
  const { fromId, toId, myGiftId } = req.body;
  const fromUsername = users.get(fromId)?.username || 'user';
  const toUsername = users.get(toId)?.username || 'user';

  const sessionId = `gift_ex_${Date.now()}`;

  const gift = gifts.get(myGiftId);
  if (!gift || gift.ownerId !== Number(fromId)) {
    return res.json({ success: false });
  }

  exchangeSessions.set(sessionId, {
    fromId, toId, fromGiftId: myGiftId, toGiftId: null,
    fromUsername, toUsername, fromConfirmed: false, toConfirmed: false, status: 'pending'
  });

  try {
    await bot.sendMessage(toId, `🎁 *Обмен подарками!* От @${fromUsername}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎁 Выбрать подарок", web_app: { url: `https://bupsiapp.vercel.app/exchange.html?startapp=${sessionId}` } },
            { text: "❌ Отклонить", callback_data: `decline_exchange_${sessionId}` }
          ]
        ]
      },
      parse_mode: 'Markdown'
    });
    res.json({ success: true, sessionId });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/api/exchange/select-gift', (req, res) => {
  const { sessionId, userId, giftId } = req.body;
  const session = exchangeSessions.get(sessionId);
  if (!session || session.toId !== Number(userId)) return res.json({ error: "Нет доступа" });

  const gift = gifts.get(giftId);
  if (!gift || gift.ownerId !== Number(userId)) return res.json({ error: "Не владелец" });

  session.toGiftId = giftId;
  exchangeSessions.set(sessionId, session);
  res.json({ success: true });
});

app.post('/api/confirm-exchange', async (req, res) => {
  const { sessionId, userId } = req.body;
  const session = exchangeSessions.get(sessionId);
  if (!session) return res.json({ error: "not_found" });

  if (session.fromId === userId) session.fromConfirmed = true;
  if (session.toId === userId) session.toConfirmed = true;

  if (session.fromConfirmed && session.toConfirmed) {
    const fromGift = gifts.get(session.fromGiftId);
    const toGift = gifts.get(session.toGiftId);

    if (fromGift && toGift) {
      fromGift.ownerId = session.toId;
      toGift.ownerId = session.fromId;
      fromGift.inExchange = true;
      toGift.inExchange = true;

      await bot.sendMessage(session.fromId, `✅ Подарки обменены! Вы получили: ${toGift.name}`);
      await bot.sendMessage(session.toId, `✅ Подарки обменены! Вы получили: ${fromGift.name}`);

      history.push({
        userId: session.fromId,
        type: 'gifts_received',
        description: `Получил "${toGift.name}" от @${session.toUsername}`,
        date: new Date().toISOString()
      });
      history.push({
        userId: session.toId,
        type: 'gifts_received',
        description: `Получил "${fromGift.name}" от @${session.fromUsername}`,
        date: new Date().toISOString()
      });
    }
  }

  res.json({ success: true });
});

app.get('/api/session/:sessionId', (req, res) => {
  const session = exchangeSessions.get(req.params.sessionId);
  if (!session) return res.json({ error: "not_found" });
  res.json(session);
});
