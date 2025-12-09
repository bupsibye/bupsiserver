const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('.'));

// === ТОКЕН БОТА ===
const BOT_TOKEN = process.env.BOT_TOKEN || '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: { timeout: 10 }
  }
});

// 🟨 ВРЕМЕННОЕ ХРАНИЛИЩЕ (в памяти). Позже заменить на БД
const users = new Map(); // userId → { stars, username }
const exchanges = new Map(); // sessionId → { fromId, toId, stars, status }
const history = []; // Массив операций: { userId, type, description, date }

// Инициализация тестовых пользователей (опционально)
users.set(123456789, { stars: 100, username: 'testuser' });

// === ОСНОВНЫЕ МАРШРУТЫ ===

// Проверка сервера
app.get('/', (req, res) => {
  res.send('✅ Сервер работает! Добро пожаловать в BupsiServer');
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: "API живо", timestamp: new Date().toISOString() });
});

// === API: Получение баланса пользователя ===
app.get('/api/stars/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) {
    return res.status(400).json({ error: "Неверный ID" });
  }

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

  // В реальной версии: искать targetUsername в БД или через Telegram API
  // Сейчас — имитация: создаём "виртуального" пользователя
  const toId = 987654321; // Здесь может быть реальный ID из БД
  const toUsername = targetUsername;

  let toUser = users.get(toId);
  if (!toUser) {
    toUser = { stars: 50, username: toUsername };
    users.set(toId, toUser);
  }

  const stars = 50; // Сумма обмена (позже — параметр)
  const sessionId = `ex_${Date.now()}_${fromId}`;

  // Сохраняем сессию обмена
  exchanges.set(sessionId, {
    fromId,
    toId,
    stars,
    status: 'pending',
    timestamp: Date.now()
  });

  try {
    // Отправляем сообщение получателю
    await bot.sendMessage(toId, `
🔄 Запрос на обмен!

От: @${fromUsername}
Сумма: ${stars} ⭐

👉 Нажмите кнопку ниже, чтобы принять обмен.

[Принять обмен](https://t.me/bupsibot/app?startapp=exchange_${sessionId})
    `, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

    // Логируем операцию
    history.push({
      userId: fromId,
      type: 'exchange_pending',
      description: `Запрос на обмен ${stars} ⭐ пользователю @${toUsername}`,
      date: new Date().toISOString()
    });

    console.log(`🔄 Обмен инициирован: ${fromId} → ${toId}, session=${sessionId}`);

    res.json({ success: true, sessionId });

  } catch (err) {
    console.error("❌ Ошибка отправки сообщения:", err);
    res.json({ success: false, error: "Не удалось отправить запрос получателю" });
  }
});

// === API: Принять обмен (по ссылке) ===
app.get('/api/accept-exchange/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const exchange = exchanges.get(sessionId);

  if (!exchange) {
    return res.json({ success: false, error: "Сессия не найдена" });
  }

  if (exchange.status !== 'pending') {
    return res.json({ success: false, error: "Обмен уже обработан" });
  }

  const fromUser = users.get(exchange.fromId);
  const toUser = users.get(exchange.toId);

  if (!fromUser || !toUser) {
    return res.json({ success: false, error: "Пользователь не найден" });
  }

  // Проверка баланса отправителя
  if (fromUser.stars < exchange.stars) {
    return res.json({ success: false, error: "Недостаточно звёзд" });
  }

  // Проводим обмен
  fromUser.stars -= exchange.stars;
  toUser.stars += exchange.stars;
  exchange.status = 'accepted';

  // Добавляем в историю
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

  try {
    // Уведомления
    await bot.sendMessage(exchange.fromId, `✅ Ваш обмен принят! Вы отправили ${exchange.stars} ⭐`);
    await bot.sendMessage(exchange.toId, `✅ Вы получили ${exchange.stars} ⭐ от @${fromUser.username}`);
  } catch (err) {
    console.error("⚠️ Не удалось отправить уведомление:", err);
  }

  res.json({ success: true, stars: toUser.stars });
});

// === API: История операций ===
app.get('/api/history/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) {
    return res.status(400).json({ error: "Неверный ID" });
  }

  const userHistory = history
    .filter(h => h.userId === userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date)) // новые сверху
    .slice(0, 50); // лимит

  res.json(userHistory);
});

// === API: Диалог подтверждён (пример) ===
app.get('/api/hello/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  try {
    await bot.sendMessage(userId, "✅ Диалог подтверждён — приложение готово!", { parse_mode: 'Markdown' });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: "Напишите /start боту в Telegram" });
  }
});

// === ЗАПУСК СЕРВЕРА ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🔗 API доступно: /api/test`);
});
