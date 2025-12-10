const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// Парсим JSON
app.use(bodyParser.json());

// === ТОКЕН ТВОЕГО БОТА ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBHOOK_URL = 'https://bupsiserver.onrender.com';

// === СОЗДАНИЕ БОТА ===
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// === УСТАНОВКА ВЕБХУКА ===
app.get('/set-webhook', async (req, res) => {
  const url = `${WEBHOOK_URL}/bot${BOT_TOKEN}`;
  await bot.setWebHook(url);
  res.send(`
    <h1>✅ Вебхук установлен!</h1>
    <p><strong>URL:</strong> ${url}</p>
    <p>Теперь напиши боту /start</p>
  `);
});

// === ЭТО ОЧЕНЬ ВАЖНО: Telegram шлёт сюда обновления ===
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === ОБРАБОТКА /start ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  const username = msg.from.username ? `@${msg.from.username}` : 'друг';

  const webAppUrl = 'https://bupsiapp.vercel.app';

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
    console.error('❌ Ошибка при /start:', err);
  });
});

// === ХРАНИЛИЩЕ ЗАПРОСОВ НА ОБМЕН ===
const exchangeRequests = new Map(); // fromId -> { toId, fromUsername }

// ✅ РОУТ: /api/start-exchange (POST) — ОТПРАВКА ПРИГЛАШЕНИЯ
app.post('/api/start-exchange', async (req, res) => {
  const { fromId, toUsername, fromUsername } = req.body;

  if (!fromId || !toUsername) {
    return res.json({ success: false, error: 'Не хватает данных: fromId или toUsername' });
  }

  try {
    // Получаем информацию о пользователе по username
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

    // Текст сообщения
    const message = `
🔄 Запрос на обмен!

От: @${fromUsername}
Предлагает начать обмен подарками

👉 Примите или отклоните:
    `.trim();

    // Отправляем приглашение
    await bot.sendMessage(toId, message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    // Успешно
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Ошибка отправки приглашения:', err);
    res.json({
      success: false,
      error: err.response?.body?.description || 'Пользователь не найден или не писал боту'
    });
  }
});

// === ОБРАБОТКА ОТКЛОНЕНИЯ ===
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
    console.error('❌ Не удалось уведомить инициатора:', err);
  }

  // Подтверждаем нажатие
  await bot.answerCallbackQuery(query.id, { text: 'Вы отклонили запрос' });
});

// === ГЛАВНАЯ СТРАНИЦА (чтобы Render не "спал") ===
app.get('/', (req, res) => {
  res.send('<h1>🚀 Bupsi Server — работает</h1><p>Установи вебхук: <a href="/set-webhook">/set-webhook</a></p>');
});

// === ЗАПУСК СЕРВЕРА ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔧 Установи вебхук: ${WEBHOOK_URL}/set-webhook`);
});
