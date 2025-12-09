const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('.'));

// === ТОКЕН ===
const BOT_TOKEN = process.env.BOT_TOKEN || '8212274685:AAEN_jjb3hUnVN9CxdR9lSrG416yQXmk4Tk';
const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: { timeout: 10 }
  }
});

// === ХРАНИЛИЩЕ ===
const userStars = new Map();
const userHistory = new Map();
const greetedUsers = new Set(); // Чтобы не спамить приветствиями

// === CORS ===
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// === Логируем всех, кто пишет боту (включая /start) ===
bot.on('message', async (msg) => {
  const { id, first_name, username } = msg.from;
  console.log(`💬 Сообщение от @${username || 'unknown'} (${id}): ${msg.text}`);

  // Если пользователь написал /start — шлём приветствие
  if (msg.text === '/start') {
    const welcomeMsg = `👋 Привет, ${first_name}! Добро пожаловать в *Bupsi*!\n\nТеперь вы можете использовать Mini App и обмениваться подарками.`;

    try {
      await bot.sendMessage(id, welcomeMsg, { parse_mode: 'Markdown' });
      greetedUsers.add(id); // Помечаем как поздравленного
    } catch (err) {
      console.error(`❌ Не удалось отправить приветствие ${id}:`, err.response?.body);
    }
  }
});

// === API: открытие Mini App — авто-подтверждение диалога ===
app.get('/api/hello/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  console.log(`👋 /api/hello: ${userId}`);

  if (greetedUsers.has(userId)) {
    return res.json({ success: true, message: "Уже приветствовали" });
  }

  try {
    await bot.sendMessage(userId, `✅ Добро пожаловать! Диалог подтверждён — вы можете использовать обмен.`, {
      parse_mode: 'Markdown'
    });
    greetedUsers.add(userId);
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Не могу писать пользователю ${userId}:`, err.response?.body);
    res.json({ success: false, error: "Пользователь не начал диалог. Напишите /start боту." });
  }
});

// === API: баланс ===
app.get('/api/stars/:userId', (req, res) => {
  const stars = userStars.get(parseInt(req.params.userId)) || 0;
  res.json({ stars });
});

// === API: обмен по username ===
app.post('/api/start-exchange-by-username', async (req, res) => {
  const { fromId, fromUsername, targetUsername } = req.body;
  const cleanTarget = targetUsername.replace(/^@/, '').toLowerCase();

  let toId;
  try {
    const chat = await bot.getChat(`@${cleanTarget}`);
    toId = chat.id;
  } catch (err) {
    return res.json({ 
      success: false, 
      error: "Пользователь не найден. Убедитесь, что он писал /start боту" 
    });
  }

  try {
    await bot.sendMessage(toId, "Тест", { disable_notification: true });
    await bot.deleteMessage(toId, (await bot.sendMessage(toId, "Тест отправки")).message_id);
  } catch (err) {
    return res.json({ 
      success: false, 
      error: "Бот не может писать этому пользователю. Напишите /start в боте." 
    });
  }

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Принять", callback_data: `accept_exchange_${fromId}` },
        { text: "❌ Отклонить", callback_data: `decline_exchange_${fromId}` }
      ]
    ]
  };

  try {
    await bot.sendMessage(toId, `📩 *${fromUsername || 'Пользователь'}* предлагает обмен!`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: "Не удалось отправить приглашение" });
  }
});

// === Запуск ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
