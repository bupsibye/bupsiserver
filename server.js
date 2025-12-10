const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());

// === ТОКЕН ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBHOOK_URL = 'https://bupsiserver.onrender.com';

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// === УСТАНОВКА ВЕБХУКА ===
app.get('/set-webhook', async (req, res) => {
  const url = `${WEBHOOK_URL}/bot${BOT_TOKEN}`;
  await bot.setWebHook(url);
  res.send(`
    <h1>✅ Вебхук установлен</h1>
    <p><strong>URL:</strong> ${url}</p>
    <p>Теперь бот будет получать сообщения</p>
  `);
});

// ВАЖНО: Telegram шлёт сюда данные
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ✅ ОБРАБОТКА /start — ПОЛНОЕ ВОССТАНОВЛЕНИЕ СТАРОГО СООБЩЕНИЯ
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username ? `@${msg.from.username}` : 'друг';
  const firstName = msg.from.first_name;

  const webAppUrl = 'https://bupsiapp.vercel.app'; // ← твой Mini App

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '🎁 Открыть Knox Market',
          web_app: { url: webAppUrl }
        }
      ]
    ]
  };

  const message = `
👋 Привет, ${firstName}! Добро пожаловать в Bupsi!

Здесь ты можешь:
- 💬 Обмениваться ⭐️ с друзьями
- 🎁 Покупать и дарить подарки
- 📊 Повышать свой статус

Нажми кнопку ниже, чтобы начать:
  `.trim();

  bot.sendMessage(chatId, message, {
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  }).catch(err => {
    console.error('❌ Ошибка /start:', err);
  });
});

// === ХРАНИЛИЩЕ для обмена ===
const exchangeRequests = new Map(); // fromId → { toId, fromUsername }

// === API: Начать обмен по username ===
app.post('/api/start-exchange', async (req, res) => {
  const { fromId, toUsername } = req.body;
  const fromUsername = req.body.fromUsername || 'друг';

  try {
    // Получаем информацию о пользователе
    const chat = await bot.getChat(`@${toUsername}`);
    const toId = chat.id;

    // Сохраняем запрос
    exchangeRequests.set(`${fromId}->${toId}`, { fromId, toId, fromUsername });

    // Кнопки: принять / отклонить
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ Принять',
            web_app: { url: `https://bupsiapp.vercel.app?startapp=exchange_${fromId}` }
          },
          {
            text: '❌ Отклонить',
            callback_data: `decline_${fromId}_${toId}`
          }
        ]
      ]
    };

    const message = `
🔄 Запрос на обмен!

От: @${fromUsername}
Предлагает начать обмен подарками

👉 Примите или отклоните:
    `.trim();

    await bot.sendMessage(toId, message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    res.json({ success: true, message: 'Приглашение отправлено' });
  } catch (err) {
    console.error('❌ Ошибка отправки:', err);
    res.json({
      success: false,
      error: err.response?.body?.description || 'Пользователь не найден или не писал боту'
    });
  }
});

// === Обработка отклонения ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const username = query.from.username || 'пользователь';

  if (data.startsWith('decline_')) {
    const [, fromId, toId] = data.split('_');

    // Удаляем запрос
    exchangeRequests.delete(`${fromId}->${toId}`);

    // Редактируем сообщение
    await bot.editMessageText('❌ Вы отклонили запрос на обмен.', {
      chat_id: chatId,
      message_id: query.message.message_id
    });

    // Уведомляем инициатора
    try {
      await bot.sendMessage(fromId, `❌ @${username} отказался от вашего предложения обмена`);
    } catch (err) {
      console.error('Не удалось уведомить инициатора:', err);
    }

    await bot.answerCallbackQuery(query.id, { text: 'Вы отклонили запрос' });
  }
});

// === Главная страница ===
app.get('/', (req, res) => {
  res.send('<h1>🚀 Bupsi Server — работает</h1>');
});

// === ЗАПУСК ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔧 Установи вебхук: ${WEBHOOK_URL}/set-webhook`);
});
