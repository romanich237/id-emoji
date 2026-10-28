const CACHE_KEY = "emoji-id-catalog-v3";
function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return value && Array.isArray(value.packs) ? value.packs : null;
  } catch {
    return null;
  }
}
function writeCache(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ saved: Date.now(), packs: items }));
  } catch {
    // Browser storage is optional.
  }
}
const API = "https://id-emoji-api.kupulluyc1242.workers.dev";
const packNames = ["TgAndroidIcons", "NewsEmoji", "IconsInTg", "tgiosicons"];
const $ = (id) => document.getElementById(id);

let packs = [];
let activePack = "Все";
let selectedEmoji = null;

function fileUrl(fileId) {
  return API + "/api/file?id=" + encodeURIComponent(fileId);
}

function setStatus(message) {
  $("status").textContent = message;
}

function fallback(emoji) {
  const span = document.createElement("span");
  span.className = "fallback";
  span.textContent = emoji.emoji || "⭐";
  return span;
}

function createMedia(emoji) {
  if (!emoji.file_id) return fallback(emoji);

  if (emoji.type === "webp") {
    const image = document.createElement("img");
    image.src = fileUrl(emoji.file_id);
    image.alt = emoji.emoji || "Telegram Emoji";
    image.loading = "lazy";
    image.addEventListener("error", () => image.replaceWith(fallback(emoji)));
    return image;
  }

  if (emoji.type === "webm") {
    const video = document.createElement("video");
    video.src = fileUrl(emoji.file_id);
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("error", () => video.replaceWith(fallback(emoji)));
    return video;
  }

  if (emoji.type === "tgs") {
    const holder = document.createElement("span");
    holder.className = "tgs-animation";
    holder.setAttribute("role", "img");
    holder.setAttribute("aria-label", emoji.emoji || "Анимированный эмодзи");

    if (!window.lottie || !("DecompressionStream" in window)) {
      holder.append(fallback(emoji));
      return holder;
    }

    fetch(fileUrl(emoji.file_id))
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить TGS");
        return response.blob();
      })
      .then(async (blob) => {
        const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
        return new Response(stream).json();
      })
      .then((animationData) => {
        if (!holder.isConnected) return;
        window.lottie.loadAnimation({
          container: holder,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData
        });
      })
      .catch(() => {
        if (holder.isConnected) holder.replaceChildren(fallback(emoji));
      });

    return holder;
  }

  return fallback(emoji);
}

function renderFilters() {
  const navigation = $("filters");
  navigation.replaceChildren();

  for (const name of ["Все", ...packNames]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-button" + (name === activePack ? " active" : "");
    button.textContent = name;
    button.setAttribute("aria-pressed", String(name === activePack));

    button.addEventListener("click", () => {
      activePack = name;
      renderFilters();
      renderCatalog();
    });

    navigation.append(button);
  }
}

function allVisibleEmoji() {
  return packs
    .filter((pack) => activePack === "Все" || pack.name === activePack)
    .flatMap((pack) =>
      (pack.emojis || []).map((emoji) => ({
        ...emoji,
        pack: pack.title || pack.name
      }))
    );
}

function renderCatalog() {
  const emojis = allVisibleEmoji();
  const grid = $("grid");
  grid.replaceChildren();

  for (const emoji of emojis) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "emoji-tile";
    button.title = emoji.pack + " · " + emoji.id;
    button.setAttribute("aria-label", "Получить ID эмодзи " + emoji.id);
    button.append(createMedia(emoji));
    button.addEventListener("click", () => showEmoji(emoji));
    grid.append(button);
  }

  $("count").textContent = emojis.length + " эмодзи";
  const failedPacks = packs.filter((pack) => pack.error).map((pack) => pack.name);

  if (failedPacks.length) {
    setStatus("Не удалось загрузить: " + failedPacks.join(", ") + ". Проверьте доступность паков и токен бота.");
  } else {
    setStatus(emojis.length ? "Нажми на эмодзи, чтобы скопировать ID" : "В выбранном наборе нет эмодзи");
  }
}

function showEmoji(emoji) {
  selectedEmoji = emoji;
  $("selectedName").textContent = emoji.pack || "Telegram Emoji";
  $("selectedId").textContent = emoji.id;
  $("preview").replaceChildren(createMedia(emoji));
  if (!$("details").open) $("details").showModal();
}

async function copyText(value, buttonId) {
  try {
    await navigator.clipboard.writeText(value);
    const button = $(buttonId);
    const oldLabel = button.textContent;
    button.textContent = "Скопировано!";
    window.setTimeout(() => {
      button.textContent = oldLabel;
    }, 1400);
  } catch {
    setStatus("Не удалось скопировать текст");
  }
}

$("close").addEventListener("click", () => $("details").close());
$("details").addEventListener("click", (event) => {
  if (event.target === $("details")) $("details").close();
});

$("copyId").addEventListener("click", () => {
  if (selectedEmoji) copyText(selectedEmoji.id, "copyId");
});

$("copyHtml").addEventListener("click", () => {
  if (!selectedEmoji) return;
  const html = '<tg-emoji emoji-id="' + selectedEmoji.id + '">' +
    (selectedEmoji.emoji || "⭐") + "</tg-emoji>";
  copyText(html, "copyHtml");
});


async function initialize() {
  renderFilters();
  const cached = readCache();
  if (cached) {
    packs = cached;
    renderCatalog();
  } else {
    setStatus("Загружаем эмодзи…");
  }

  try {
    const response = await fetch(API + "/api/packs");
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Ошибка API");

    packs = data.packs || [];
    writeCache(packs);
    renderCatalog();
  } catch (error) {
    if (cached) {
      setStatus("Показан сохранённый каталог. Обновление пока недоступно.");
    } else {
      $("count").textContent = "0 эмодзи";
      setStatus("Не удалось загрузить каталог: " + (error.message || "ошибка соединения"));
    }
  }
}

/* Additional catalog features */
const favoritesStorageKey = "emoji-id-favorites-v2";
let savedFavorites = [];
try {
  const parsed = JSON.parse(localStorage.getItem(favoritesStorageKey) || "[]");
  if (Array.isArray(parsed)) savedFavorites = parsed;
} catch {
  savedFavorites = [];
}
const favorites = new Set(savedFavorites);
let favoritesOnly = false;
let textFilter = "";
const searchTerms = {
  "огонь": "🔥", "fire": "🔥", "сердце": "❤️", "heart": "❤️",
  "звезда": "⭐", "star": "⭐", "корона": "👑", "crown": "👑",
  "алмаз": "💎", "diamond": "💎", "лайк": "👍", "like": "👍",
  "ракета": "🚀", "rocket": "🚀", "кот": "🐱", "cat": "🐱",
  "подарок": "🎁", "gift": "🎁", "деньги": "💰", "money": "💰"
};

const originalAllVisibleEmoji = allVisibleEmoji;
allVisibleEmoji = function () {
  const query = textFilter.toLowerCase().trim();
  const symbol = searchTerms[query] || query;

  return originalAllVisibleEmoji().filter((emoji) => {
    if (favoritesOnly && !favorites.has(emoji.id)) return false;
    if (!query) return true;
    return emoji.id.includes(query) ||
      emoji.emoji.includes(symbol) ||
      emoji.pack.toLowerCase().includes(query);
  });
};

const originalRenderCatalog = renderCatalog;
renderCatalog = function () {
  originalRenderCatalog();
  for (const tile of $("grid").children) {
    const id = tile.title.split(" · ").pop();
    if (favorites.has(id)) tile.classList.add("is-favorite");
  }
};

const originalShowEmoji = showEmoji;
showEmoji = function (emoji) {
  originalShowEmoji(emoji);
  $("saveFavorite").textContent = favorites.has(emoji.id)
    ? "★ Убрать из избранного" : "☆ В избранное";
};

$("saveFavorite").addEventListener("click", () => {
  if (!selectedEmoji) return;

  if (favorites.has(selectedEmoji.id)) {
    favorites.delete(selectedEmoji.id);
  } else {
    favorites.add(selectedEmoji.id);
  }

  try {
    localStorage.setItem(favoritesStorageKey, JSON.stringify([...favorites]));
  } catch {
    // Storage may be disabled.
  }
  $("saveFavorite").textContent = favorites.has(selectedEmoji.id)
    ? "★ Убрать из избранного" : "☆ В избранное";
  renderCatalog();
});

$("onlyFavorites").addEventListener("click", () => {
  favoritesOnly = !favoritesOnly;
  $("onlyFavorites").textContent = favoritesOnly ? "★ Все эмодзи" : "☆ Избранное";
  renderCatalog();
});

$("copyCode").addEventListener("click", () => {
  if (!selectedEmoji) return;
  copyText('icon_custom_emoji_id: "' + selectedEmoji.id + '"', "copyCode");
});

$("copyApi").addEventListener("click", () => {
  copyText(API + "/api/packs", "copyApi");
});

$("exportJson").addEventListener("click", () => {
  const data = allVisibleEmoji().map((item) => ({
    custom_emoji_id: item.id,
    fallback: item.emoji,
    pack: item.pack,
    type: item.type,
    html: '<tg-emoji emoji-id="' + item.id + '">' + item.emoji + '</tg-emoji>'
  }));

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "emoji-id-catalog.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
});

$("packForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const raw = $("packLink").value.trim();
  const match = raw.match(/^(?:https?:\/\/)?(?:t\.me\/addemoji\/)?([a-zA-Z0-9_]{1,64})\/?$/);

  if (!match) {
    setStatus("Нужна ссылка t.me/addemoji/Название");
    return;
  }

  const name = match[1];
  if (packs.some((pack) => pack.name === name)) {
    activePack = name;
    renderFilters();
    renderCatalog();
    return;
  }

  setStatus("Загружаем набор…");
  try {
    const response = await fetch(API + "/api/packs?name=" + encodeURIComponent(name));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ошибка API");

    const pack = data.packs && data.packs[0];
    if (!pack || pack.error) throw new Error(pack?.error || "Набор недоступен");

    packs.push(pack);
    if (!packNames.includes(name)) packNames.push(name);
    writeCache(packs);
    activePack = name;
    textFilter = "";
    $("packLink").value = "";
    renderFilters();
    renderCatalog();
  } catch (error) {
    setStatus("Не удалось добавить набор: " + error.message);
  }
});

// Match ordinary Unicode emoji against the fallback emoji supplied by Telegram.
function normalizeEmoji(value) {
  return value.normalize("NFC").replace(/[\uFE0E\uFE0F]/g, "").trim();
}

function searchByStaticEmoji() {
  const query = $("search").value.trim();
  favoritesOnly = false;
  $("onlyFavorites").textContent = "☆ Избранное";
  activePack = "Все";
  textFilter = "";

  if (!query) {
    renderFilters();
    renderCatalog();
    return;
  }

  const normalized = normalizeEmoji(query);
  const all = packs.flatMap((pack) =>
    (pack.emojis || []).map((emoji) => ({
      ...emoji,
      pack: pack.title || pack.name
    }))
  );

  const matches = all.filter((emoji) => {
    const fallback = normalizeEmoji(emoji.emoji || "");
    return fallback === normalized ||
      (normalized.length > 0 && fallback.includes(normalized));
  });

  renderFilters();
  const grid = $("grid");
  grid.replaceChildren();

  for (const emoji of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "emoji-tile" + (favorites.has(emoji.id) ? " is-favorite" : "");
    button.title = emoji.pack + " · " + emoji.id;
    button.setAttribute("aria-label", "Показать Premium Emoji " + emoji.id);
    button.append(createMedia(emoji));
    button.addEventListener("click", () => showEmoji(emoji));
    grid.append(button);
  }

  $("count").textContent = matches.length + " эмодзи";
  setStatus(matches.length
    ? "Найдено вариантов: " + matches.length + ". Нажми на эмодзи, чтобы скопировать ID."
    : "Для этого обычного эмодзи совпадений в загруженных наборах нет.");
}

$("searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  searchByStaticEmoji();
});

$("search").addEventListener("input", () => {
  searchByStaticEmoji();
});

initialize();
