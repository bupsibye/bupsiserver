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

// === Простое API для проверки ===
app.get('/', (req, res) => {
  res.send('✅ Сервер работает! Используй /api/test');
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: "API живо" });
});

// === Подтверждение диалога ===
app.get('/api/hello/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  try {
    await bot.sendMessage(userId, "✅ Диалог подтверждён", { parse_mode: 'Markdown' });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: "Напишите /start боту" });
  }
});

// === API: баланс ===
app.get('/api/stars/:userId', (req, res) => {
  res.json({ stars: 0 });
});

// === API: начать обмен (заглушка) ===
app.post('/api/start-exchange-by-username', async (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;
  console.log('🔄 Обмен:', { fromId, fromUsername, targetUsername });

  // Имитация успешного ответа
  res.json({ success: true, sessionId: 'test_session_123' });
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
