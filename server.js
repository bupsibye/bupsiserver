const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());

// === НАСТРОЙКИ С ТВОИМ ТОКЕНОМ ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk'; // ✅ Твой токен
const WEBHOOK_URL = 'https://bupsiserver.onrender.com'; // ✅ Render URL

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// === ХРАНИЛИЩЕ ПОДАРКОВ ===
const gifts = new Map();
let giftIdCounter = 1;

const exchangeSessions = new Map();

// === УСТАНОВКА ВЕБХУКА ===
app.get('/set-webhook', async (req, res) => {
  const url = `${WEBHOOK_URL}/bot${BOT_TOKEN}`;
  await bot.setWebHook(url);
  res.send(`
    <h1>✅ Вебхук установлен!</h1>
    <p><strong>URL:</strong> ${url}</p>
    <p>Теперь открой бота в Telegram и напиши <code>/start</code></p>
  `);
});

// Важно: Telegram отправляет updates сюда
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === ОБРАБОТКА /start ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;

  console.log(`🆕 /start от @${msg.from.username} (ID: ${chatId})`);

  bot.sendMessage(chatId, `👋 Привет, ${firstName}!\n\nВаш ID: \`${chatId}\`\nИспользуйте его для обмена подарками.`, {
    parse_mode: 'Markdown'
  }).catch(err => {
    console.error('❌ Ошибка отправки сообщения:', err);
  });
});

// === ОБРАБОТКА: Отклонение обмена ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  if (data.startsWith('decline_exchange_')) {
    const [, fromId, toId] = data.split('_');

    await bot.answerCallbackQuery(query.id, { text: 'Вы отклонили обмен' });

    try {
      await bot.sendMessage(fromId, '❌ Пользователь отклонил обмен.');
      await bot.editMessageText('❌ Обмен отклонён.', {
        chat_id: chatId,
        message_id: query.message.message_id
      });

      // Отмечаем сессию как отменённую
      for (let [k, v] of exchangeSessions) {
        if (v.fromId == fromId && v.toId == chatId) {
          v.status = 'declined';
          break;
        }
      }
    } catch (err) {
      console.error('❌ Ошибка при отклонении:', err);
    }
  }
});

// === API: Добавить подарок (временно) ===
app.post('/api/add-gift', (req, res) => {
  const { userId, name } = req.body;
  const giftId = giftIdCounter++;
  gifts.set(giftId, {
    id: giftId,
    name,
    ownerId: Number(userId),
    inExchange: false
  });
  res.json({ success: true, giftId });
});

// === API: Получить подарки пользователя ===
app.get('/api/user-gifts/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const userGifts = [...gifts.values()].filter(g => g.ownerId === userId && !g.inExchange);
  res.json(userGifts);
});

// === API: Начать сессию обмена ===
app.post('/api/start-exchange', async (req, res) => {
  const { fromId, toId, myGiftId } = req.body;
  const sessionId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  const gift = gifts.get(myGiftId);
  if (!gift || gift.ownerId !== Number(fromId)) {
    return res.json({ success: false, error: "Подарок не найден или не ваш" });
  }

  exchangeSessions.set(sessionId, {
    fromId: Number(fromId),
    toId: Number(toId),
    myGiftId,
    partnerGiftId: null,
    fromConfirmed: false,
    toConfirmed: false,
    status: 'pending'
  });

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🎁 Выбрать свой подарок",
          web_app: { url: `https://bupsiapp.vercel.app?startapp=${sessionId}` }
        },
        {
          text: "❌ Отклонить",
          callback_data: `decline_exchange_${fromId}_${toId}`
        }
      ]
    ]
  };

  try {
    await bot.sendMessage(toId, `🤝 *Пользователь предлагает обмен подарками!*\n\nВыберите свой подарок.`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error('❌ Ошибка отправки сообщения:', err);
    res.json({ success: false, error: "Не удалось отправить сообщение" });
  }
});

// === API: Выбрать подарок в обмене ===
app.post('/api/exchange/select-gift', (req, res) => {
  const { sessionId, userId, giftId } = req.body;
  const session = exchangeSessions.get(sessionId);
  if (!session) return res.json({ error: "Сессия не найдена" });

  const gift = gifts.get(Number(giftId));
  if (!gift || gift.ownerId !== Number(userId)) {
    return res.json({ error: "Вы не владеете этим подарком" });
  }

  if (session.toId === Number(userId)) {
    session.partnerGiftId = Number(giftId);
    exchangeSessions.set(sessionId, session);
  }

  res.json({ success: true });
});

// === API: Подтвердить обмен ===
app.post('/api/exchange/confirm', async (req, res) => {
  const { sessionId, userId } = req.body;
  const session = exchangeSessions.get(sessionId);
  if (!session) return res.json({ error: "Сессия не найдена" });

  if (session.fromId === Number(userId)) session.fromConfirmed = true;
  if (session.toId === Number(userId)) session.toConfirmed = true;

  exchangeSessions.set(sessionId, session);

  if (session.fromConfirmed && session.toConfirmed) {
    const gift1 = gifts.get(session.myGiftId);
    const gift2 = gifts.get(session.partnerGiftId);

    if (gift1 && gift2) {
      gift1.ownerId = session.toId;
      gift1.inExchange = true;

      gift2.ownerId = session.fromId;
      gift2.inExchange = true;

      await bot.sendMessage(session.fromId, `✅ Обмен завершён! Вы получили:\n🎁 ${gift2.name}`, { parse_mode: 'Markdown' });
      await bot.sendMessage(session.toId, `✅ Обмен завершён! Вы получили:\n🎁 ${gift1.name}`, { parse_mode: 'Markdown' });
    }
  }

  res.json({ success: true });
});

// === API: Получить сессию (polling) ===
app.get('/api/session/:sessionId', (req, res) => {
  const session = exchangeSessions.get(req.params.sessionId);
  if (!session) return res.json({ error: "not_found" });
  res.json(session);
});

// === ГЛАВНАЯ СТРАНИЦА (чтобы Render не "спал") ===
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 Gift Exchange Backend</h1>
    <p>Бэкенд работает. Установите вебхук: <a href="/set-webhook">/set-webhook</a></p>
  `);
});

// === ЗАПУСК СЕРВЕРА ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔹 Установите вебхук: ${WEBHOOK_URL}/set-webhook`);
  console.log(`🔹 Проверьте бота: https://t.me/GiftSwapBot`); // ← замени на имя твоего бота
});
