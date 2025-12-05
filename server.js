const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('.')); // раздаём index.html, style.css и т.д.

// === НАСТРОЙКИ ===
const BOT_TOKEN = '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk'; // ← ЗАМЕНИТЬ
const WEBHOOK_URL = 'https://ваш-url.ngrok.io'; // ← ЗАМЕНИТЬ

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// === ХРАНИЛИЩЕ ДАННЫХ (в продакшене — MongoDB/Firebase) ===
const gifts = new Map(); // giftId → { id, name, ownerId, inExchange }
let giftIdCounter = 1;

const exchangeSessions = new Map(); // sessionId → { fromId, toId, myGiftId, partnerGiftId, fromConfirmed, toConfirmed }

// === УСТАНОВКА ВЕБХУКА ===
app.get('/set-webhook', async (req, res) => {
  await bot.setWebHook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);
  res.send('✅ Вебхук установлен');
});

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === КОМАНДА /start — получение ID ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  bot.sendMessage(chatId, `👋 Привет, ${firstName}!\n\nВаш ID: \`${chatId}\`\nИспользуйте его для обмена подарками.`, {
    parse_mode: 'Markdown'
  });
});

// === ОБРАБОТКА КНОПОК: Отклонить обмен ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  if (data.startsWith('decline_exchange_')) {
    const parts = data.split('_');
    const fromId = parts[2];
    const toId = parts[3];

    await bot.answerCallbackQuery(query.id, { text: 'Вы отменили обмен' });
    await bot.sendMessage(fromId, `❌ Пользователь отклонил обмен.`);
    await bot.editMessageText('❌ Обмен отклонён.', {
      chat_id: chatId,
      message_id: query.message.message_id
    });
  }
});

// === API: добавить подарок пользователю ===
app.post('/api/add-gift', (req, res) => {
  const { userId, name } = req.body;
  const giftId = giftIdCounter++;

  gifts.set(giftId, {
    id: giftId,
    name: name,
    ownerId: Number(userId),
    inExchange: false
  });

  res.json({ success: true, giftId });
});

// === API: получить подарки пользователя ===
app.get('/api/user-gifts/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const userGifts = [...gifts.values()].filter(g => g.ownerId === userId && !g.inExchange);
  res.json(userGifts);
});

// === API: начать сессию обмена ===
app.post('/api/start-exchange', async (req, res) => {
  const { fromId, toId, myGiftId } = req.body;
  const sessionId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  // Проверка подарка
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

  // Кнопка с Mini App
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🎁 Выбрать свой подарок",
          web_app: { url: `${WEBHOOK_URL}?startapp=${sessionId}` }
        },
        {
          text: "❌ Отклонить",
          callback_data: `decline_exchange_${fromId}_${toId}`
        }
      ]
    ]
  };

  try {
    await bot.sendMessage(toId, `🤝 *Пользователь предлагает обмен подарками!*\n\nВыберите свой подарок, чтобы продолжить.`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    res.json({ success: true, sessionId });
  } catch (err) {
    res.json({ success: false, error: "Не удалось отправить сообщение" });
  }
});

// === API: выбрать подарок в сессии ===
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

// === API: подтвердить обмен (оба подтверждают) ===
app.post('/api/exchange/confirm', async (req, res) => {
  const { sessionId, userId } = req.body;
  const session = exchangeSessions.get(sessionId);

  if (!session) return res.json({ error: "Сессия не найдена" });

  if (session.fromId === Number(userId)) {
    session.fromConfirmed = true;
  } else if (session.toId === Number(userId)) {
    session.toConfirmed = true;
  }

  exchangeSessions.set(sessionId, session);

  // Оба подтвердили — меняем владельцев
  if (session.fromConfirmed && session.toConfirmed) {
    const gift1 = gifts.get(session.myGiftId);
    const gift2 = gifts.get(session.partnerGiftId);

    if (gift1 && gift2) {
      // Меняем владельцев
      gift1.ownerId = session.toId;
      gift1.inExchange = true;

      gift2.ownerId = session.fromId;
      gift2.inExchange = true;

      // Уведомляем
      await bot.sendMessage(session.fromId, `✅ Обмен завершён!\n\nВы получили:\n🎁 ${gift2.name}`, {
        parse_mode: 'Markdown'
      });

      await bot.sendMessage(session.toId, `✅ Обмен завершён!\n\nВы получили:\n🎁 ${gift1.name}`, {
        parse_mode: 'Markdown'
      });
    }
  }

  res.json({ success: true });
});

// === API: получить сессию (polling) ===
app.get('/api/session/:sessionId', (req, res) => {
  const session = exchangeSessions.get(req.params.sessionId);
  if (!session) return res.json({ error: "not_found" });
  res.json(session);
});

// === ЗАПУСК СЕРВЕРА ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🔧 Установите вебхук: ${WEBHOOK_URL}/set-webhook`);
});
