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

  // Формат TGS требует отдельного проигрывателя анимации.
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
  setStatus(emojis.length ? "Нажми на эмодзи, чтобы скопировать ID" : "Эмодзи пока недоступны");
}

function showEmoji(emoji) {
  selectedEmoji = emoji;
  $("selectedName").textContent = emoji.pack || "Telegram Emoji";
  $("selectedId").textContent = emoji.id;
  $("preview").replaceChildren(createMedia(emoji));
  $("details").showModal();
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

$("searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("search").value.trim();

  if (!/^\d{1,30}$/.test(id)) {
    setStatus("Введи числовой ID эмодзи");
    return;
  }

  setStatus("Ищем эмодзи…");

  try {
    const response = await fetch(API + "/api/emoji?id=" + encodeURIComponent(id));
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Ошибка API");

    if (data.emojis && data.emojis.length) {
      showEmoji(data.emojis[0]);
      setStatus("Эмодзи найден");
    } else {
      setStatus("Эмодзи с таким ID не найден");
    }
  } catch {
    setStatus("Не удалось выполнить поиск. Попробуй позднее");
  }
});

async function initialize() {
  renderFilters();
  setStatus("Загружаем эмодзи…");

  try {
    const response = await fetch(API + "/api/packs");
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Ошибка API");

    packs = data.packs || [];
    renderCatalog();
  } catch {
    $("count").textContent = "0 эмодзи";
    setStatus("Не удалось загрузить каталог. Попробуй обновить страницу");
  }
}

initialize();