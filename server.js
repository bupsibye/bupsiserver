const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());

// === ТОКЕН ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBHOOK_URL = 'https://bupsiserver.onrender.com';

// === БОТ ===
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// === УСТАНОВКА ВЕБХУКА ===
app.get('/set-webhook', async (req, res) => {
  const url = `${WEBHOOK_URL}/bot${BOT_TOKEN}`;
  await bot.setWebHook(url);
  res.send(`
    <h1>✅ Вебхук установлен!</h1>
    <p><strong>URL:</strong> ${url}</p>
    <p>Теперь открой бота и напиши /start</p>
  `);
});

// === Важно: Telegram шлёт сюда обновления ===
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === /start с кнопкой ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  const username = msg.from.username ? `@${msg.from.username}` : 'друг';

  const webAppUrl = 'https://bupsiapp.vercel.app';

  const keyboard = {
    inline_keyboard: [[{
      text: '🎁 Открыть Knox Market',
      web_app: { url: webAppUrl }
    }]]
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
  }).catch(console.error);
});

// === ХРАНИЛИЩЕ ОБМЕНОВ ===
const exchangeRequests = new Map();

// ✅ РОУТ: /api/start-exchange
app.post('/api/start-exchange', async (req, res) => {
  const { fromId, toUsername, fromUsername } = req.body;

  if (!fromId || !toUsername) {
    return res.json({ success: false, error: 'Missing fromId or toUsername' });
  }

  try {
    // Получаем ID по username
    const chat = await bot.getChat(`@${toUsername}`);
    const toId = chat.id;

    // Сохраняем запрос
    exchangeRequests.set(`${fromId}->${toId}`, { fromId, toId, fromUsername });

    // Кнопки
    const keyboard = {
      inline_keyboard: [[
        {
          text: '✅ Принять',
          web_app: { url: `https://bupsiapp.vercel.app?startapp=exchange_${fromId}` }
        },
        {
          text: '❌ Отклонить',
          callback_data: `decline_${fromId}_${toId}`
        }
      ]]
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

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Ошибка:', err);
    res.json({
      success: false,
      error: err.response?.body?.description || 'Пользователь не найден или не писал боту'
    });
  }
});

// === Обработка отклонения ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  if (!data.startsWith('decline_')) return;

  const [, fromId, toId] = data.split('_');
  const username = query.from.username || 'пользователь';

  // Удаляем запрос
  exchangeRequests.delete(`${fromId}->${toId}`);

  // Меняем сообщение
  await bot.editMessageText('❌ Вы отклонили запрос на обмен.', {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id
  });

  // Уведомляем инициатора
  try {
    await bot.sendMessage(fromId, `❌ @${username} отказался от вашего предложения обмена`);
  } catch (err) {
    console.error('Не удалось уведомить инициатора:', err);
  }

  await bot.answerCallbackQuery(query.id, { text: 'Вы отклонили запрос' });
});

// === Главная ===
app.get('/', (req, res) => {
  res.send('<h1>🚀 Bupsi Server — работает. Установи вебхук: /set-webhook</h1>');
});

// === ЗАПУСК ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔧 Установи вебхук: ${WEBHOOK_URL}/set-webhook`);
});
