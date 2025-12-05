const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('.'));

// === НАСТРОЙКИ ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';

const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: { timeout: 10 }
  }
});

// === CORS для Mini App ===
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// === Простой маршрут ===
app.get('/', (req, res) => {
  res.send('Сервер запущен');
});

// === API: баланс звёзд ===
app.get('/api/stars/:userId', (req, res) => {
  // Здесь будет логика (пока заглушка)
  res.json({ stars: 0 });
});

// === API: история ===
app.get('/api/history/:userId', (req, res) => {
  res.json([]);
});

// === Обработка платежей ===
bot.on('pre_checkout_query', (query) => {
  bot.answerPrecheckoutQuery(query.id, true);
});

bot.on('successful_payment', (payment) => {
  console.log('Платёж успешен:', payment);
});

// === Запуск сервера ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
