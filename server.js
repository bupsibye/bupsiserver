const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

// === НАСТРОЙКИ ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBHOOK_URL = 'https://bupsiserver.onrender.com';
const WEB_APP_URL = 'https://bupsiapp.vercel.app';

// === БОТ ===
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// === ХРАНИЛИЩЕ сессий ===
const exchangeSessions = new Map(); // sessionId → { fromId, fromUsername, targetUsername }

// === УСТАНОВКА ВЕБХУКА ===
app.get('/set-webhook', async (req, res) => {
  const url = `${WEBHOOK_URL}/bot${BOT_TOKEN}`;
  try {
    await bot.setWebHook(url);
    res.send(`
      <h1>✅ Вебхук установлен!</h1>
      <p><code>${url}</code></p>
      <p>Напиши /start в <a href="https://t.me/bupsibot">@bupsibot</a></p>
    `);
  } catch (err) {
    res.status(500).send(`❌ Ошибка: ${err.message}`);
  }
});

// === Telegram шлёт сюда обновления ===
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === /start — с кнопкой Mini App ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;

  const keyboard = {
    inline_keyboard: [[{
      text: '🎁 Открыть Bupsi Market',
      web_app: { url: WEB_APP_URL }
    }]]
  };

  const message = `
👋 Привет, ${firstName}! Добро пожаловать в Bupsi!

Здесь ты можешь:
- 💬 Обмениваться ⭐ с друзьями
- 🎁 Покупать и дарить подарки

Нажми кнопку ниже, чтобы начать:
  `.trim();

  bot.sendMessage(chatId, message, {
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  }).catch(console.error);
});

// === API: начать обмен по username ===
app.post('/api/start-exchange-by-username', (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;

  if (!fromId || !fromUsername || !targetUsername) {
    return res.json({ success: false, error: 'Не хватает данных' });
  }

  // Генерируем сессию, но НЕ пытаемся найти пользователя
  const sessionId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  exchangeSessions.set(sessionId, {
    fromId: Number(fromId),
    fromUsername,
    targetUsername,
    status: 'pending'
  });

  // Возвращаем ссылку для ручной отправки
  const exchangeLink = `${WEB_APP_URL}?startapp=exchange_${sessionId}`;

  res.json({
    success: true,
    message: `Скопируйте и отправьте эту ссылку @${targetUsername} вручную:`,
    link: exchangeLink
  });
});

// === API: принять обмен (заглушка) ===
app.post('/api/accept-exchange/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = exchangeSessions.get(sessionId);

  if (!session) {
    return res.json({ success: false, error: 'Сессия не найдена' });
  }

  exchangeSessions.delete(sessionId);

  res.json({
    success: true,
    stars: 50,
    message: `Вы получили 50 ⭐ от @${session.fromUsername}`
  });
});

// === Главная страница ===
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 Bupsi Server — работает</h1>
    <p><a href="/set-webhook">🔧 Установить вебхук</a></p>
    <p>Mini App: <a href="${WEB_APP_URL}" target="_blank">Открыть</a></p>
  `);
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔧 Установи вебхук: ${WEBHOOK_URL}/set-webhook`);
});
