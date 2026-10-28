const CACHE_KEY = "emoji-id-catalog-v3";
function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return value && Array.isArray(value.packs) ? value : null;
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
const PAGE_SIZE = 80;
let visibleLimit = PAGE_SIZE;
let currentRender = 0;
let mediaObserver = null;
const tgsPromises = new Map();

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

function createMedia(emoji, eager = false) {
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
    video.preload = "none";
    if (eager) video.src = fileUrl(emoji.file_id);
    else video.dataset.src = fileUrl(emoji.file_id);
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

    const loadTgs = () => {
    let task = tgsPromises.get(emoji.file_id);
    if (!task) {
      task = fetch(fileUrl(emoji.file_id))
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить TGS");
        return response.blob();
      })
      .then(async (blob) => {
        const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
        return new Response(stream).json();
      })
      .then((animationData) => animationData);
      tgsPromises.set(emoji.file_id, task);
      if (tgsPromises.size > 150) tgsPromises.delete(tgsPromises.keys().next().value);
    }
    task.then((animationData) => {
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
        tgsPromises.delete(emoji.file_id);
        if (holder.isConnected) holder.replaceChildren(fallback(emoji));
      });
    };
    if (eager) loadTgs();
    else holder._loadMedia = loadTgs;
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

function ensureMediaObserver() {
  if (mediaObserver || !("IntersectionObserver" in window)) return;
  mediaObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const node = entry.target;
      mediaObserver.unobserve(node);
      if (node.dataset.src) {
        node.src = node.dataset.src;
        delete node.dataset.src;
      }
      if (node._loadMedia) {
        node._loadMedia();
        node._loadMedia = null;
      }
    }
  }, { rootMargin: "250px" });
}

function makeTile(emoji) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "emoji-tile" + (favorites.has(emoji.id) ? " is-favorite" : "");
  button.title = emoji.pack + " · " + emoji.id;
  button.setAttribute("aria-label", "Получить ID эмодзи " + emoji.id);
  const media = createMedia(emoji);
  button.append(media);
  if (media.dataset.src || media._loadMedia) {
    ensureMediaObserver();
    if (mediaObserver) mediaObserver.observe(media);
    else {
      if (media.dataset.src) media.src = media.dataset.src;
      if (media._loadMedia) media._loadMedia();
    }
  }
  button.addEventListener("click", () => showEmoji(emoji));
  return button;
}

function drawEmojis(emojis, reset = true) {
  const grid = $("grid");
  if (reset) {
    currentRender += 1;
    visibleLimit = PAGE_SIZE;
    grid.replaceChildren();
  }
  const count = Math.min(visibleLimit, emojis.length);
  const fragment = document.createDocumentFragment();
  for (let i = grid.childElementCount; i < count; i++) {
    fragment.append(makeTile(emojis[i]));
  }
  grid.append(fragment);
  $("count").textContent = emojis.length + " эмодзи";
  $("loadMore").hidden = count >= emojis.length;
  $("loadMore").textContent = "Показать ещё · " + (emojis.length - count);
}

function renderCatalog() {
  const emojis = allVisibleEmoji();
  drawEmojis(emojis);
  const failed = packs.filter((pack) => pack.error).map((pack) => pack.name);
  setStatus(failed.length
    ? "Недоступные наборы: " + failed.join(", ")
    : emojis.length ? "Нажми на эмодзи, чтобы скопировать ID" : "В выбранном наборе нет эмодзи");
}

function showEmoji(emoji) {
  selectedEmoji = emoji;
  $("selectedName").textContent = emoji.pack || "Telegram Emoji";
  $("selectedId").textContent = emoji.id;
  $("preview").replaceChildren(createMedia(emoji, true));
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
    packs = cached.packs;
    for (const pack of packs) {
      if (pack.name && !packNames.includes(pack.name)) packNames.push(pack.name);
    }
    renderFilters();
    renderCatalog();
    if (Date.now() - (cached.saved || 0) < 86400000) return;
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
  drawEmojis(matches);
  setStatus(matches.length
    ? "Найдено вариантов: " + matches.length + ". Нажми на эмодзи, чтобы скопировать ID."
    : "Для этого обычного эмодзи совпадений в загруженных наборах нет.");
}

$("loadMore").addEventListener("click", () => {
  visibleLimit += PAGE_SIZE;
  const query = $("search").value.trim();
  if (query) {
    const normalized = normalizeEmoji(query);
    const matches = packs.flatMap(pack => (pack.emojis || []).map(emoji => ({
      ...emoji, pack: pack.title || pack.name
    }))).filter(emoji => {
      const value = normalizeEmoji(emoji.emoji || "");
      return value === normalized || value.includes(normalized);
    });
    drawEmojis(matches, false);
  } else {
    drawEmojis(allVisibleEmoji(), false);
  }
});

$("searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  searchByStaticEmoji();
});

$("search").addEventListener("input", () => {
  searchByStaticEmoji();
});

initialize();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
