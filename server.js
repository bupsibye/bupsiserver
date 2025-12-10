const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());

// === ТВОЙ ТОКЕН ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBHOOK_URL = 'https://bupsiserver.onrender.com';

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// === ХРАНИЛИЩЕ ===
const gifts = new Map();
let giftIdCounter = 1;

// === УСТАНОВКА ВЕБХУКА ===
app.get('/set-webhook', async (req, res) => {
  await bot.setWebHook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);
  res.send(`
    <h1>✅ Вебхук установлен</h1>
    <p>URL: ${WEBHOOK_URL}/bot${BOT_TOKEN}</p>
    <p>Теперь открой бота в Telegram и напиши /start</p>
  `);
});

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ✅ ОБРАБОТКА /start — ПРИВЕТСТВИЕ
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  bot.sendMessage(chatId, `👋 Привет, ${firstName}!\n\nВаш ID: \`${chatId}\``, {
    parse_mode: 'Markdown'
  }).catch(err => {
    console.error('❌ Ошибка отправки /start:', err);
  });
});

// === API: Начать обмен (по username) ===
app.post('/api/start-exchange', async (req, res) => {
  const { fromId, toUsername } = req.body;

  try {
    // Поиск пользователя по username
    const chat = await bot.getChat(`@${toUsername}`);
    const toId = chat.id;

    // Отправка приглашения
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "✅ Принять обмен",
            web_app: { url: `https://bupsiapp.vercel.app?startapp=exchange_${fromId}` }
          },
          {
            text: "❌ Отклонить",
            callback_data: `decline_${fromId}`
          }
        ]
      ]
    };

    await bot.sendMessage(toId, `🤝 *Вам пришло предложение обменяться подарками!*`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    res.json({ success: true, message: 'Приглашение отправлено' });
  } catch (err) {
    console.error('❌ Ошибка:', err);
    res.json({ success: false, error: 'Пользователь не найден или не писал боту' });
  }
});

// === Обработка отклонения ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  if (data.startsWith('decline_')) {
    const fromId = data.split('_')[1];
    await bot.answerCallbackQuery(query.id, { text: 'Вы отклонили обмен' });
    await bot.editMessageText('❌ Обмен отклонён.', {
      chat_id: chatId,
      message_id: query.message.message_id
    });
    await bot.sendMessage(fromId, '❌ Пользователь отклонил ваш запрос на обмен.');
  }
});

// === Главная страница (чтобы Render не "спал") ===
app.get('/', (req, res) => {
  res.send('<h1>🚀 Bupsi Server — работает</h1>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔧 Установи вебхук: ${WEBHOOK_URL}/set-webhook`);
});
