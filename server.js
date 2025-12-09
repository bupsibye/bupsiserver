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

// === ХРАНИЛИЩЕ сессий обмена ===
const exchangeSessions = new Map(); // sessionId → { fromId, toId, fromUsername, status }

// === Подтверждение диалога ===
app.get('/api/hello/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  try {
    await bot.sendMessage(userId, `✅ Диалог с ботом подтверждён.`, { parse_mode: 'Markdown' });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: "Напишите /start боту" });
  }
});

// === API: баланс звёзд ===
app.get('/api/stars/:userId', (req, res) => {
  res.json({ stars: 0 }); // заглушка
});

// === API: начать обмен ===
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

  // Проверим, может ли бот писать
  try {
    await bot.sendMessage(toId, "Тест", { disable_notification: true });
    await bot.deleteMessage(toId, (await bot.sendMessage(toId, "Тест отправки")).message_id);
  } catch (err) {
    return res.json({ 
      success: false, 
      error: "Бот не может писать этому пользователю. Пусть напишет /start" 
    });
  }

  // Генерация ID сессии
  const sessionId = `ex_${Date.now()}_${fromId}`;
  exchangeSessions.set(sessionId, {
    fromId,
    toId,
    fromUsername: fromUsername || `user${fromId}`,
    status: 'pending'
  });

  // Кнопки под сообщением
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "✅ Принять",
          web_app: { url: `https://bupsiapp.vercel.app?exchange_id=${sessionId}` }
        },
        {
          text: "❌ Отклонить",
          callback_data: `decline_exchange_${sessionId}`
        }
      ]
    ]
  };

  // Отправляем сообщение
  try {
    await bot.sendMessage(toId, `📩 У вас новое предложение на обмен от *${fromUsername || 'Пользователь'}*`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    res.json({ success: true, sessionId });
  } catch (err) {
    console.error("❌ Ошибка отправки:", err);
    res.json({ success: false, error: "Не удалось отправить приглашение" });
  }
});

// === Обработка нажатия "Отклонить" ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  if (data.startsWith('decline_exchange_')) {
    const sessionId = data.split('_').slice(3).join('_');
    const session = exchangeSessions.get(sessionId);

    if (!session) {
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // Удаляем сессию
    exchangeSessions.delete(sessionId);

    // Уведомляем инициатора
    try {
      await bot.sendMessage(session.fromId, `❌ *${session.fromUsername}* отказался от обмена.`, {
        parse_mode: 'Markdown'
      });
    } catch (err) {
      console.error(`❌ Не могу уведомить инициатора ${session.fromId}`);
    }

    // Подтверждаем и редактируем сообщение
    await bot.answerCallbackQuery(query.id, { text: 'Вы отклонили обмен' });
    await bot.editMessageText('❌ Вы отклонили обмен.', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id
    });
  }
});

// === Запуск сервера ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
