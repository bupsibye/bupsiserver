const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// === Парсим JSON и раздаём статику ===
app.use(express.json());
app.use(express.static('.'));

// === Переменные: BOT_TOKEN и SERVER_URL ===
const BOT_TOKEN = process.env.BOT_TOKEN || '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const SERVER_URL = process.env.SERVER_URL || 'https://bupsiserver.onrender.com';
const PORT = process.env.PORT || 3000;

// === Инициализация бота ===
const bot = new TelegramBot(BOT_TOKEN, { polling: false }); // Webhook, не polling!

// Логи для отладки (можно убрать позже)
console.log("✅ BOT_TOKEN:", BOT_TOKEN);
console.log("✅ SERVER_URL:", SERVER_URL);
console.log("✅ PORT:", PORT);

// === Установка Webhook и обработка обновлений ===
const webhookUrl = `${SERVER_URL}/${BOT_TOKEN}`;

// Обработка входящих запросов от Telegram
app.post(`/${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Установка Webhook при старте
async function setupWebhook() {
  try {
    await bot.setWebHook(webhookUrl);
    console.log(`✅ Webhook установлен: ${webhookUrl}`);
  } catch (err) {
    console.error('❌ Ошибка установки Webhook:', err.message);
  }
}

// === ОСНОВНЫЕ МАРШРУТЫ ===

// Главная страница
app.get('/', (req, res) => {
  res.send('✅ Сервер работает! BupsiServer активен.');
});

// Проверка Webhook (для отладки)
app.get('/webhook-info', async (req, res) => {
  try {
    const info = await bot.getWebHookInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === ОБРАБОТЧИК /start ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const startParam = msg.text.split(' ')[1]; // /start exchange_abc123

  if (startParam?.startsWith('exchange_')) {
    bot.sendMessage(chatId, `
🔄 Обмен начат!

Кто-то хочет обменяться с тобой ⭐

👉 Открой Mini App, чтобы принять или отклонить.
    `, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Открыть App", web_app: { url: "https://t.me/bupsibot/app" } }]
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
          [{ text: "Открыть App", web_app: { url: "https://t.me/bupsibot/app" } }]
        ]
      }
    });
  }
});

// === ВРЕМЕННОЕ ХРАНИЛИЩЕ (в памяти) ===
const users = new Map(); // userId → { stars, username }
const exchanges = new Map(); // sessionId → { fromId, toId, stars, status }
const history = []; // { userId, type, description, date }

// Инициализация тестового пользователя
users.set(123456789, { stars: 100, username: 'testuser' });

// === API: Получение баланса ===
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

// === API: Начать обмен по username ===
app.post('/api/start-exchange-by-username', async (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;

  if (!fromId || !fromUsername || !targetUsername) {
    return res.json({ success: false, error: "Недостаточно данных" });
  }

  // В реальности: искать пользователя по username через Telegram API
  const toId = 987654321; // Заглушка
  let toUser = users.get(toId);
  if (!toUser) {
    toUser = { stars: 50, username: targetUsername };
    users.set(toId, toUser);
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

[Принять обмен](https://t.me/bupsibot/app?startapp=${sessionId})
    `, { parse_mode: 'Markdown' });

    history.push({
      userId: fromId,
      type: 'exchange_pending',
      description: `Запрос на обмен ${stars} ⭐ пользователю @${targetUsername}`,
      date: new Date().toISOString()
    });

    res.json({ success: true, sessionId });
  } catch (err) {
    console.error("❌ Ошибка отправки:", err);
    res.json({ success: false, error: "Не удалось отправить запрос" });
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

  // Проводим обмен
  fromUser.stars -= exchange.stars;
  toUser.stars += exchange.stars;
  exchange.status = 'accepted';

  // История
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

  // Уведомления
  await bot.sendMessage(exchange.fromId, `✅ Обмен принят! Вы отправили ${exchange.stars} ⭐`);
  await bot.sendMessage(exchange.toId, `✅ Обмен завершён! Вы получили ${exchange.stars} ⭐`);

  res.json({ success: true, stars: toUser.stars });
});

// === API: История операций ===
app.get('/api/history/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ error: "Неверный ID" });

  const userHistory = history
    .filter(h => h.userId === userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 50);

  res.json(userHistory);
});

// === API: Диалог подтверждён (тест) ===
app.get('/api/hello/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  try {
    await bot.sendMessage(userId, "✅ Диалог подтверждён — всё работает!", { parse_mode: 'Markdown' });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: "Напишите /start боту" });
  }
});

// === ЗАПУСК СЕРВЕРА ===
app.listen(PORT, async () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  await setupWebhook(); // Устанавливаем Webhook после запуска сервера
});
