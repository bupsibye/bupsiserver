const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json()); // ❌ Не bodyParser, а express.json()

// === НАСТРОЙКИ ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBHOOK_URL = 'https://bupsiserver.onrender.com';
const WEB_APP_URL = 'https://bupsiapp.vercel.app';

// === БОТ ===
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// === ХРАНИЛИЩЕ сессий ===
const exchangeSessions = new Map();

// === УСТАНОВКА ВЕБХУКА ===
app.get('/set-webhook', async (req, res) => {
  const url = `${WEBHOOK_URL}/bot${BOT_TOKEN}`;
  await bot.setWebHook(url);
  res.send(`
    <h1>✅ Вебхук установлен!</h1>
    <p><code>${url}</code></p>
    <p>Напиши /start в боте.</p>
  `);
});

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === /start ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  const username = msg.from.username ? `@${msg.from.username}` : 'друг';

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

Нажми кнопку ниже:
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

  const sessionId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  exchangeSessions.set(sessionId, {
    fromId: Number(fromId),
    fromUsername,
    targetUsername,
    status: 'pending'
  });

  try {
    // Ищем пользователя среди тех, кто писал боту
    const updates = await bot.getUpdates();
    const targetUser = updates
      .map(u => u.message?.from || u.callback_query?.from)
      .find(u => u && u.username?.toLowerCase() === targetUsername.toLowerCase());

    if (!targetUser) {
      return res.json({
        success: false,
        error: `@${targetUsername} не найден. Он должен был начать диалог с ботом.`
      });
    }

    const keyboard = {
      inline_keyboard: [[
        {
          text: '✅ Принять',
          web_app: { url: `${WEB_APP_URL}?startapp=exchange_${sessionId}` }
        },
        {
          text: '❌ Отклонить',
          callback_data: `decline_${sessionId}`
        }
      ]]
    };

    const message = `
🔄 *Запрос на обмен!*

От: @${fromUsername}
Предлагает начать обмен подарками

👉 Примите или отклоните:
    `.trim();

    await bot.sendMessage(targetUser.id, message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    res.json({ success: true, message: `Запрос отправлен @${targetUsername}` });
  } catch (err) {
    console.error('❌ Ошибка:', err);
    res.json({ success: false, error: 'Не удалось отправить запрос' });
  }
});

// === Обработка: отклонение ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  if (!data.startsWith('decline_')) return;

  const sessionId = data.split('_')[1];
  const session = exchangeSessions.get(sessionId);

  if (session) {
    exchangeSessions.delete(sessionId);

    await bot.editMessageText('❌ Вы отклонили запрос.', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id
    });

    try {
      await bot.sendMessage(session.fromId, `❌ @${session.targetUsername} отказался от вашего предложения.`);
    } catch (err) {
      console.error('Не удалось уведомить инициатора:', err);
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
    message: `Вы получили 50 ⭐`
  });
});

// === Главная ===
app.get('/', (req, res) => {
  res.send('<h1>🚀 Bupsi Server — работает</h1><p><a href="/set-webhook">🔧 Установить вебхук</a></p>');
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔧 Установи вебхук: ${WEBHOOK_URL}/set-webhook`);
});
