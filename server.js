const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('.'));

// === НАСТРОЙКИ ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const WEBAPP_URL = 'https://bupsiapp.vercel.app';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === ХРАНИЛИЩЕ ===
const exchangeSessions = new Map();

bot.on('message', (msg) => {
  if (msg.from?.username) {
    const username = msg.from.username.toLowerCase();
    exchangeSessions.set(`user:${username}`, msg.from.id);
  }
});

// === API: начать обмен ===
app.post('/api/start-exchange-by-username', async (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;
  const cleanTarget = targetUsername.replace(/^@/, '').toLowerCase();

  if (!cleanTarget || cleanTarget === fromUsername.toLowerCase()) {
    return res.json({ success: false, error: "Неверный username" });
  }

  let toId;
  try {
    const chat = await bot.getChat(`@${cleanTarget}`);
    toId = chat.id;
  } catch (err) {
    return res.json({ success: false, error: "Пользователь не найден. Убедитесь, что он писал ботам в Telegram." });
  }

  const sessionId = `ex_${Date.now()}`;
  exchangeSessions.set(sessionId, {
    fromId, toId, fromUsername, fromConfirmed: false, toConfirmed: false, giftFrom: null, giftTo: null
  });

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Принять", callback_data: `accept_exchange_${sessionId}` },
        { text: "❌ Отклонить", callback_data: `decline_exchange_${sessionId}` }
      ]
    ]
  };

  try {
    await bot.sendMessage(toId, `📩 *${fromUsername}* предлагает вам обмен!`, {
      reply_markup: keyboard, parse_mode: 'Markdown'
    });
    res.json({ success: true, sessionId });
  } catch (err) {
    res.json({ success: false, error: "Не удалось отправить" });
  }
});

// === Обработка кнопок ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  if (data.startsWith('decline_exchange_ex_')) {
    const sessionId = data.split('_').slice(2).join('_');
    const session = exchangeSessions.get(sessionId);
    if (!session) return;

    await bot.answerCallbackQuery(query.id);
    await bot.editMessageText('❌ Обмен отклонён.', { chat_id: chatId, message_id: query.message.message_id });
    await bot.sendMessage(session.fromId, `❌ Пользователь отклонил обмен.`);
    exchangeSessions.delete(sessionId);
  }

  if (data.startsWith('accept_exchange_ex_')) {
    const sessionId = data.split('_').slice(2).join('_');
    const session = exchangeSessions.get(sessionId);
    if (!session || session.toId !== chatId) return;

    session.toConfirmed = true;
    exchangeSessions.set(sessionId, session);

    await bot.answerCallbackQuery(query.id, { text: 'Обмен принят!' });
    await bot.editMessageText(`✅ Вы приняли обмен с *${session.fromUsername}*!`, {
      chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown'
    });

    await bot.sendMessage(session.fromId, `✅ Пользователь принял ваш запрос!`, {
      reply_markup: {
        inline_keyboard: [[{
          text: "✅ Подтвердить",
          web_app: { url: `${WEBAPP_URL}?startapp=${sessionId}` }
        }]]
      }
    });
  }
});

// === API: получить сессию ===
app.get('/api/session/:sessionId', (req, res) => {
  const session = exchangeSessions.get(req.params.sessionId);
  res.json(session ? session : { error: "not_found" });
});

// === API: добавить подарок ===
app.post('/api/exchange/add-gift', (req, res) => {
  const { sessionId, userId, giftName } = req.body;
  const session = exchangeSessions.get(sessionId);
  if (!session) return res.json({ error: "Сессия не найдена" });

  if (userId == session.fromId) session.giftFrom = giftName;
  else if (userId == session.toId) session.giftTo = giftName;

  if (session.giftFrom && session.giftTo) {
    bot.sendMessage(session.fromId, `🎁 Обмен завершён! Вы получите: *${session.giftTo}*`, { parse_mode: 'Markdown' });
    bot.sendMessage(session.toId, `🎁 Обмен завершён! Вы получите: *${session.giftFrom}*`, { parse_mode: 'Markdown' });
  }

  exchangeSessions.set(sessionId, session);
  res.json({ success: true });
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
