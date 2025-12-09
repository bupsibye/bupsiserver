// === Инициализация Telegram WebApp ===
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  console.log('✅ Telegram WebApp: готов');
} else {
  console.warn('❌ Telegram WebApp не доступен. Добавьте <script src="https://telegram.org/js/telegram-web-app.js"></script>');
}

// === Применение темы ===
function applyTheme() {
  const theme = tg?.themeParams || {};
  const dark = tg?.colorScheme === 'dark';
  document.documentElement.style.setProperty('--tg-bg', theme.bg_color || (dark ? '#1a1a1a' : '#fff'));
  document.documentElement.style.setProperty('--tg-text', theme.text_color || (dark ? '#fff' : '#000'));
  document.documentElement.style.setProperty('--tg-hint', theme.hint_color || (dark ? '#999' : '#888'));
  document.documentElement.style.setProperty('--tg-accent', theme.accent_text_color || '#0088cc');
  document.documentElement.style.setProperty('--tg-secondary-bg', dark ? '#2c2c2c' : '#f0f0f0');
  document.documentElement.style.setProperty('--tg-border', dark ? '#444' : '#ddd');
}
applyTheme();

// === Получение пользователя из Telegram ===
let user = null;

try {
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    user = tg.initDataUnsafe.user;
    console.log('✅ Пользователь получен:', user);
  } else {
    console.warn('❌ initData не содержит user. Откройте Mini App через кнопку в боте.');
  }
} catch (err) {
  console.error('❌ Ошибка при получении пользователя:', err);
}

// === DOM-элементы ===
const starsCount = document.getElementById("stars-count");
const userIdEl = document.getElementById("user-id");
const usernameEl = document.getElementById("user-username");
const avatarEl = document.getElementById("user-avatar");
const startExchangeBtn = document.getElementById("start-exchange-by-username");

// === Отображение профиля ===
if (user && userIdEl) {
  userIdEl.textContent = user.id;
  console.log('🆔 ID отображён:', user.id);
} else if (userIdEl) {
  userIdEl.textContent = "—";
}

if (user && usernameEl) {
  usernameEl.textContent = user.username ? `@${user.username}` : "не задан";
  console.log('👤 Username:', user.username || "не задан");
} else if (usernameEl) {
  usernameEl.textContent = "не задан";
}

if (user && avatarEl) {
  const photoUrl = user.photo_url 
    ? `${user.photo_url}&s=150` 
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.first_name || 'User')}&background=random&size=100`;

  avatarEl.src = photoUrl;
  avatarEl.onerror = () => {
    avatarEl.src = "https://via.placeholder.com/50/CCCCCC/000?text=👤";
    console.warn('🖼️ Аватарка не загрузилась, использована заглушка');
  };
  console.log('🖼️ Аватарка:', photoUrl);
} else if (avatarEl) {
  avatarEl.src = "https://via.placeholder.com/50/CCCCCC/000?text=👤";
}

// === Переключение вкладок ===
document.querySelectorAll(".tab-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    button.classList.add("active");

    if (button.id === "buy-stars-top") {
      window.open('https://spend.tg/telegram-stars', '_blank');
      return;
    }

    const tabId = button.id.replace("tab-", "");
    const tab = document.getElementById(tabId);
    if (tab) {
      tab.classList.add("active");
      console.log(`📱 Переключено на вкладку: ${tabId}`);
    }
  });
});

// === Загрузка баланса звёзд ===
async function loadStars() {
  if (!starsCount || !user) {
    console.warn('⚠️ Не могу загрузить баланс: нет starsCount или user');
    return;
  }

  try {
    const url = `https://bupsiserver.onrender.com/api/stars/${user.id}`;
    console.log('⬇️ Запрос баланса:', url);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Сервер вернул ${res.status}`);

    const data = await res.json();
    starsCount.textContent = data.stars || 0;
    console.log('⭐ Баланс загружен:', data.stars);
  } catch (err) {
    console.error('❌ Ошибка загрузки баланса:', err);
    starsCount.textContent = "—";
  }
}
loadStars();

// === Кнопка "Начать обмен по username" ===
if (startExchangeBtn) {
  if (user) {
    startExchangeBtn.disabled = false;
    startExchangeBtn.style.opacity = "1";
    startExchangeBtn.addEventListener("click", async () => {
      console.log('🔄 Кнопка "Начать обмен" нажата');

      const targetUsername = prompt("Введите username пользователя:", "").trim();
      if (!targetUsername) {
        tg?.showAlert?.("Введите username");
        return;
      }

      try {
        console.log('📤 Отправка запроса на обмен:', { fromId: user.id, targetUsername });

        const res = await fetch('https://bupsiserver.onrender.com/api/start-exchange-by-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromId: user.id,
            fromUsername: user.username || `user${user.id}`,
            targetUsername
          })
        });

        const result = await res.json();
        console.log('📥 Ответ от сервера:', result);

        tg?.showAlert?.(result.success 
          ? `✅ Запрос отправлен @${targetUsername}` 
          : `❌ Ошибка: ${result.error}`
        );

        if (result.success) {
          console.log(`✅ Приглашение отправлено @${targetUsername}`);
        }
      } catch (err) {
        console.error('❌ Ошибка сети:', err);
        tg?.showAlert?.("Ошибка сети. Проверьте подключение.");
      }
    });
    console.log('✅ Кнопка обмена: активна');
  } else {
    startExchangeBtn.disabled = true;
    startExchangeBtn.style.opacity = "0.5";
    startExchangeBtn.textContent = "Обмен: недоступен";
    console.warn('❌ Кнопка обмена отключена — пользователь не определён');
  }
}

// === Вторичные вкладки (в профиле) ===
document.querySelectorAll(".tabs-secondary button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs-secondary button").forEach(b => b.classList.remove("tab-active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("tab-active");
    document.getElementById(btn.getAttribute("data-tab")).classList.add("active");
  });
});
