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

// === ХРАНИЛИЩЕ ===
const exchangeSessions = new Map(); // sessionId → { fromId, fromUsername, targetUsername }
const userCache = new Map();        // username → chatId

// === УСТАНОВКА ВЕБХУКА ===
app.get('/set-webhook', async (req, res) => {
  const url = `${WEBHOOK_URL}/bot${BOT_TOKEN}`;
  try {
    await bot.setWebHook(url);
    res.send(`
      <h1>✅ Вебхук установлен!</h1>
      <p><code>${url}</code></p>
      <p>Откройте: <a href="https://t.me/knoxway_bot">@knoxway_bot</a></p>
    `);
  } catch (err) {
    res.status(500).send(`❌ Ошибка: ${err.message}`);
  }
});

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === /start — сохраняем username и chatId ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  const username = msg.from.username;

  if (username) {
    userCache.set(username.toLowerCase(), chatId);
  }

  const keyboard = {
    inline_keyboard: [[{
      text: '🎁 Открыть Knox Market',
      web_app: { url: WEB_APP_URL }
    }]]
  };

  const message = `
👋 Привет, ${firstName}! Добро пожаловать в Knox Market!

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
app.post('/api/start-exchange-by-username', async (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;

  if (!fromId || !fromUsername || !targetUsername) {
    return res.json({ success: false, error: 'Не хватает данных' });
  }

  // Генерируем сессию
  const sessionId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  exchangeSessions.set(sessionId, {
    fromId: Number(fromId),
    fromUsername,
    targetUsername,
    status: 'pending'
  });

  // Ищем получателя
  const toChatId = userCache.get(targetUsername.toLowerCase());

  if (!toChatId) {
    return res.json({
      success: false,
      error: `Пользователь @${targetUsername} не найден. Он должен был написать боту /start`
    });
  }

  try {
    const message = `
🔄 *Предложение обмена!*

Пользователь *@${fromUsername}* предлагает начать обмен подарками.

Примете ли вы предложение?
    `.trim();

    const keyboard = {
      inline_keyboard: [[
        {
          text: '✅ Согласиться',
          web_app: { url: `${WEB_APP_URL}?startapp=exchange_${sessionId}` }
        },
        {
          text: '❌ Отказаться',
          callback_data: `decline_${sessionId}`
        }
      ]]
    };

    await bot.sendMessage(toChatId, message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    res.json({ success: true, message: `Запрос отправлен @${targetUsername}` });
  } catch (err) {
    console.error('❌ Ошибка отправки:', err);
    res.json({ success: false, error: 'Не удалось отправить сообщение' });
  }
});

// === Обработка: отказ от обмена ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  if (!data.startsWith('decline_')) return;

  const sessionId = data.split('_')[1];
  const session = exchangeSessions.get(sessionId);

  if (session) {
    exchangeSessions.delete(sessionId);

    // Редактируем сообщение
    await bot.editMessageText('❌ Вы отклонили запрос на обмен.', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id
    });

    // Уведомляем инициатора
    try {
      await bot.sendMessage(session.fromId, `
❌ *@${session.targetUsername}* отказался от вашего предложения обмена.
      `.trim(), {
        parse_mode: 'Markdown'
      });
    } catch (err) {
      console.error('❌ Не удалось уведомить инициатора:', err);
    }

    await bot.answerCallbackQuery(query.id, { text: 'Отклонено' });
  }
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
    <h1>🚀 Knox Market Server — работает</h1>
    <p><a href="/set-webhook">🔧 Установить вебхук</a></p>
    <p>Пользователей в кэше: <strong>${userCache.size}</strong></p>
  `);
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔧 Установи вебхук: ${WEBHOOK_URL}/set-webhook`);
});
