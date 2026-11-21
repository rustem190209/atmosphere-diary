// Локальный анализ текста по словарю ключевых слов (раздел 8.2 ТЗ, source: "fallback").
// Работает без ИИ и без сети: ищет в тексте слова-маркеры эмоций, мест, людей, времени суток и года.
import { clamp, type Emotion, type MoodSpec } from "../schema";
import { pickTitle } from "../title/validate";

// ---------- Словари ----------

// Начала слов (основы), по которым узнаём эмоцию. Слово подходит, если начинается с основы.
const EMOTION_STEMS: Record<Emotion, string[]> = {
  joy: [
    "радост",
    "радов",
    "рада",
    "рады",
    "весел",
    "счаст",
    "смея",
    "смех",
    "смеял",
    "улыб",
    "кайф",
    "здорово",
    "отлично",
    "прекрасн",
    "классн",
  ],
  nostalgia: [
    "вспомн",
    "вспоми",
    "помню",
    "детств",
    "ностальг",
    "раньше",
    "когда-то",
    "давно",
    "старые",
    "старых",
    "альбом",
    "прошл",
  ],
  calm: [
    "спокой",
    "тихо",
    "тихий",
    "тихая",
    "тишин",
    "уют",
    "расслаб",
    "неспеш",
    "медленн",
    "мирно",
    "умиротвор",
    "лениво",
  ],
  tenderness: [
    "нежн",
    "обня",
    "обним",
    "любим",
    "люблю",
    "ласк",
    "забот",
    "мил",
    "родн",
  ],
  excitement: [
    "восторг",
    "впервые",
    "адреналин",
    "танц",
    "прыга",
    "драйв",
    "азарт",
    "взволн",
    "ура",
    "бешен",
    "энерги",
  ],
  pride: [
    "горд",
    "сдал",
    "сдала",
    "победи",
    "справил",
    "достиг",
    "награ",
    "защитил",
    "получилось",
    "смог",
    "смогла",
  ],
  gratitude: ["благодар", "спасибо", "признател", "повезло", "ценю"],
  wonder: [
    "удивит",
    "удивил",
    "впечатл",
    "красот",
    "красив",
    "волшеб",
    "невероятн",
    "чудо",
    "восхищ",
    "закат",
    "звёзд",
    "звезд",
    "рассвет",
  ],
  melancholy: [
    "груст",
    "печал",
    "тоск",
    "слёз",
    "слез",
    "плак",
    "жаль",
    "пасмурн",
    "серый",
    "серое",
    "хмур",
    "грущ",
  ],
  loneliness: [
    "одиноч",
    "одинок",
    "никого",
    "один ",
    "одна ",
    "пусто",
    "скуча",
    "некому",
  ],
  tension: [
    "дедлайн",
    "напряж",
    "стресс",
    "нерв",
    "тревог",
    "волнов",
    "спеши",
    "срочн",
    "экзамен",
    "страшн",
    "боял",
    "паник",
    "сдача",
    "сдачи",
    "аврал",
  ],
  fatigue: [
    "устал",
    "сонн",
    "вымот",
    "тяжело",
    "выдохс",
    "недосп",
    "измот",
    "сил нет",
    "без сил",
  ],
};

// Типичное «звучание» эмоции: valence (-1..1), энергия, напряжение, теплота (0..1)
const EMOTION_DIMS: Record<Emotion, [number, number, number, number]> = {
  joy: [0.8, 0.7, 0.2, 0.7],
  nostalgia: [0.3, 0.3, 0.2, 0.7],
  calm: [0.5, 0.2, 0.1, 0.6],
  tenderness: [0.7, 0.3, 0.1, 0.85],
  excitement: [0.8, 0.9, 0.4, 0.6],
  pride: [0.7, 0.6, 0.3, 0.6],
  gratitude: [0.8, 0.4, 0.1, 0.75],
  wonder: [0.7, 0.6, 0.2, 0.55],
  melancholy: [-0.5, 0.2, 0.3, 0.35],
  loneliness: [-0.6, 0.15, 0.35, 0.25],
  tension: [-0.3, 0.8, 0.9, 0.25],
  fatigue: [-0.3, 0.15, 0.5, 0.35],
};

const ATMOSPHERE: Record<Emotion, string> = {
  joy: "светлая радость",
  nostalgia: "тёплая память",
  calm: "тихий покой",
  tenderness: "нежность",
  excitement: "живой драйв",
  pride: "тихая гордость",
  gratitude: "благодарность",
  wonder: "удивление",
  melancholy: "тихая грусть",
  loneliness: "одиночество",
  tension: "напряжённый фокус",
  fatigue: "усталость",
};

// Прилагательное настроения для названия (мужской род, остальные формы строим функцией adj)
const MOOD_ADJ: Record<Emotion, string> = {
  joy: "радостный",
  nostalgia: "тёплый",
  calm: "тихий",
  tenderness: "нежный",
  excitement: "яркий",
  pride: "важный",
  gratitude: "светлый",
  wonder: "удивительный",
  melancholy: "задумчивый",
  loneliness: "одинокий",
  tension: "напряжённый",
  fatigue: "долгий",
};

const WARM_WORDS = [
  "солнц",
  "жар",
  "тепл",
  "какао",
  "чай",
  "плед",
  "камин",
  "костр",
  "костёр",
  "лето",
  "летн",
];
const COLD_WORDS = [
  "холод",
  "мороз",
  "снег",
  "ветер",
  "ветрен",
  "дожд",
  "лёд",
  "лед",
  "зябк",
  "сыро",
];

type Place = { re: RegExp; nom: string; phrase: string };
const PLACES: Place[] = [
  { re: /^парк/, nom: "парк", phrase: "в парке" },
  { re: /^офис/, nom: "офис", phrase: "в офисе" },
  { re: /^(дома|домой)$/, nom: "дом", phrase: "дома" },
  { re: /^кафе/, nom: "кафе", phrase: "в кафе" },
  { re: /^кофейн/, nom: "кофейня", phrase: "в кофейне" },
  { re: /^мор[ея]/, nom: "море", phrase: "у моря" },
  { re: /^(горы|горах|горам|гору)$/, nom: "горы", phrase: "в горах" },
  { re: /^город/, nom: "город", phrase: "в городе" },
  { re: /^улиц/, nom: "улица", phrase: "на улице" },
  { re: /^школ/, nom: "школа", phrase: "в школе" },
  { re: /^универ/, nom: "университет", phrase: "в университете" },
  { re: /^вокзал/, nom: "вокзал", phrase: "на вокзале" },
  { re: /^поезд/, nom: "поезд", phrase: "в поезде" },
  { re: /^озер/, nom: "озеро", phrase: "у озера" },
  { re: /^(река|реки|реке|реку)$/, nom: "река", phrase: "у реки" },
  { re: /^(лес|леса|лесу|лесом)$/, nom: "лес", phrase: "в лесу" },
  { re: /^пляж/, nom: "пляж", phrase: "на пляже" },
  { re: /^кухн/, nom: "кухня", phrase: "на кухне" },
  { re: /^концерт/, nom: "концерт", phrase: "на концерте" },
  { re: /^дач/, nom: "дача", phrase: "на даче" },
  { re: /^пруд/, nom: "пруд", phrase: "у пруда" },
  { re: /^окн/, nom: "окно", phrase: "у окна" },
  { re: /^балкон/, nom: "балкон", phrase: "на балконе" },
  { re: /^аэропорт/, nom: "аэропорт", phrase: "в аэропорту" },
  { re: /^библиотек/, nom: "библиотека", phrase: "в библиотеке" },
  { re: /^(кино|кинотеатр)/, nom: "кино", phrase: "в кино" },
  { re: /^ресторан/, nom: "ресторан", phrase: "в ресторане" },
  { re: /^аудитори/, nom: "аудитория", phrase: "в аудитории" },
];

type Person = { re: RegExp; nom: string; phrase: string };
const PEOPLE: Person[] = [
  { re: /^друз/, nom: "друзья", phrase: "с друзьями" },
  { re: /^(друг|друга|другом)$/, nom: "друг", phrase: "с другом" },
  { re: /^подруг/, nom: "подруга", phrase: "с подругой" },
  { re: /^мам/, nom: "мама", phrase: "с мамой" },
  { re: /^пап/, nom: "папа", phrase: "с папой" },
  { re: /^бабушк/, nom: "бабушка", phrase: "с бабушкой" },
  { re: /^дедушк/, nom: "дедушка", phrase: "с дедушкой" },
  { re: /^семь[еёюяи]/, nom: "семья", phrase: "с семьёй" },
  { re: /^команд/, nom: "команда", phrase: "с командой" },
  { re: /^девушк/, nom: "девушка", phrase: "с девушкой" },
  { re: /^(парень|парнем|парня)$/, nom: "парень", phrase: "с парнем" },
  { re: /^коллег/, nom: "коллеги", phrase: "с коллегами" },
  { re: /^брат/, nom: "брат", phrase: "с братом" },
  { re: /^сестр/, nom: "сестра", phrase: "с сестрой" },
  { re: /^(дети|детьми|детей)$/, nom: "дети", phrase: "с детьми" },
  { re: /^собак/, nom: "собака", phrase: "с собакой" },
];

// Предметы и детали дня: попадают в ключевые слова и в название («… и какао»)
// phrase — как предмет звучит в названии, если «и …» не подходит
const OBJECTS: { re: RegExp; nom: string; phrase?: string }[] = [
  { re: /^какао/, nom: "какао" },
  { re: /^(чай|чая|чаем|чаю)$/, nom: "чай" },
  { re: /^кофе/, nom: "кофе" },
  { re: /^музык/, nom: "музыка", phrase: "под музыку" },
  { re: /^книг/, nom: "книга", phrase: "с книгой" },
  {
    re: /^(дождь|дождя|дождём|дождем|дожде)$/,
    nom: "дождь",
    phrase: "под дождём",
  },
  { re: /^снег/, nom: "снег" },
  { re: /^закат/, nom: "закат" },
  { re: /^(костёр|костер|костра|костром)$/, nom: "костёр" },
  { re: /^гитар/, nom: "гитара" },
  { re: /^торт/, nom: "торт" },
  { re: /^фильм/, nom: "фильм" },
  { re: /^ноутбук/, nom: "ноутбук" },
  { re: /^морожен/, nom: "мороженое" },
  { re: /^пицц/, nom: "пицца" },
  { re: /^(звёзд|звезд)/, nom: "звёзды" },
  { re: /^цвет(ы|ов|ами)$/, nom: "цветы" },
  { re: /^листь/, nom: "листья" },
  { re: /^листопад/, nom: "листопад" },
  { re: /^(огни|огней|огнями)$/, nom: "огни" },
  { re: /^песн/, nom: "песня" },
  { re: /^фото/, nom: "фото" },
  { re: /^прогулк/, nom: "прогулка" },
  { re: /^разговор/, nom: "разговор" },
];

// Порядок важен: при равном счёте побеждает тот, что выше (ночь и вечер запоминаются сильнее)
const TIME_STEMS: [MoodSpec["timeOfDay"], string[]][] = [
  ["night", ["ночь", "ночью", "ночн", "полночь"]],
  ["evening", ["вечер", "закат", "сумерк"]],
  ["morning", ["утр", "рассвет", "проснул"]],
  ["day", ["днём", "днем", "обед", "полдень"]],
];
const SEASON_STEMS: [MoodSpec["season"], string[]][] = [
  ["winter", ["зим", "снег", "мороз", "новый год", "ёлк", "елк"]],
  ["spring", ["весн", "весен", "цвели", "подснеж"]],
  ["summer", ["летом", "лето", "летн", "жара", "жарк", "пляж", "купал"]],
  ["autumn", ["осен", "листь", "листопад", "сентябр", "октябр", "ноябр"]],
];

const SEASON_ADJ: Record<MoodSpec["season"], string> = {
  winter: "зимний",
  spring: "весенний",
  summer: "летний",
  autumn: "осенний",
  unknown: "",
};
const TIME_NOUN: Record<MoodSpec["timeOfDay"], [string, "m" | "n" | "f"]> = {
  morning: ["утро", "n"],
  day: ["день", "m"],
  evening: ["вечер", "m"],
  night: ["ночь", "f"],
  mixed: ["день", "m"],
};

const STOP_WORDS = new Set(
  "было была были будет очень потом когда который которая которые этого этому только сегодня просто тоже чтобы потому всего вообще время можно нужно какой какая какие такой такая такие вместе после перед через между снова опять почти совсем немного много ничего особенного обычный обычно где-то кажется".split(
    " ",
  ),
);

// ---------- Помощники ----------

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/ё/g, "е")
      .match(/[a-zа-я0-9-]+/g) ?? []
  );
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

// Согласовать прилагательное (дано в мужском роде) с родом существительного
export function adj(masc: string, gender: "m" | "n" | "f"): string {
  if (gender === "m") return masc;
  const base = masc.slice(0, -2);
  const end = masc.slice(-2);
  const soft = end === "ий" && /н$/.test(base); // осенний → осеннее / осенняя
  const hush = end === "ий" && /[жшчщ]$/.test(base); // хороший → хорошее
  if (gender === "n") return base + (soft || hush ? "ее" : "ое");
  return base + (soft ? "яя" : "ая");
}

// Сколько раз встречаются основы в тексте; слово после «не» не считаем
function countStems(tokens: string[], joined: string, stems: string[]): number {
  let n = 0;
  for (const stemRaw of stems) {
    const stem = norm(stemRaw);
    if (stem.includes(" ")) {
      // фраза из нескольких слов — ищем в тексте целиком
      if (` ${joined} `.includes(` ${stem.trim()} `) || joined.includes(stem))
        n++;
      continue;
    }
    tokens.forEach((t, i) => {
      if (t.startsWith(stem) && tokens[i - 1] !== "не") n++;
    });
  }
  return n;
}

function findFirst<T extends { re: RegExp }>(tokens: string[], list: T[]): T[] {
  const found: T[] = [];
  for (const t of tokens) {
    const hit = list.find((item) => item.re.test(t));
    if (hit && !found.includes(hit)) found.push(hit);
  }
  return found;
}

// ---------- Основная функция ----------

export interface FallbackInput {
  text: string;
  songTitle?: string;
}

export function analyzeTextFallback({ text }: FallbackInput): MoodSpec {
  const tokens = tokenize(text);
  const joined = tokens.join(" ");
  const notes: string[] = [];

  // 1. Эмоции: считаем совпадения, берём до трёх самых частых
  const scores = (Object.keys(EMOTION_STEMS) as Emotion[])
    .map((e) => ({
      emotion: e,
      score: countStems(tokens, joined, EMOTION_STEMS[e]),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const matched = scores.reduce((s, x) => s + x.score, 0);
  const emotions =
    scores.length > 0
      ? scores.map((s) => ({
          emotion: s.emotion,
          weight: +(s.score / matched).toFixed(2),
        }))
      : [{ emotion: "calm" as Emotion, weight: 1 }];
  if (scores.length === 0)
    notes.push(
      "В тексте не нашлось явных слов-эмоций — взято спокойное настроение по умолчанию",
    );

  // 2. Числовые оси: средневзвешенно по эмоциям
  let valence = 0,
    energy = 0,
    tension = 0,
    warmth = 0;
  for (const { emotion, weight } of emotions) {
    const [v, e, t, w] = EMOTION_DIMS[emotion];
    valence += v * weight;
    energy += e * weight;
    tension += t * weight;
    warmth += w * weight;
  }

  // Тёплые и холодные детали сдвигают «теплоту»
  const warmHits = countStems(tokens, joined, WARM_WORDS);
  const coldHits = countStems(tokens, joined, COLD_WORDS);
  warmth = clamp(
    warmth + 0.06 * Math.min(warmHits, 4) - 0.06 * Math.min(coldHits, 4),
  );
  if (warmHits)
    notes.push(`Тёплые детали в тексте (${warmHits}) делают день теплее`);
  if (coldHits)
    notes.push(`Холодные детали в тексте (${coldHits}) остужают палитру`);

  // Восклицательные знаки — немного больше энергии
  const exclam = (text.match(/!/g) ?? []).length;
  energy = clamp(energy + 0.04 * Math.min(exclam, 5));

  // 3. Время суток и сезон
  const timeHits = TIME_STEMS.map(
    ([k, st]) => [k, countStems(tokens, joined, st)] as const,
  ).filter(([, n]) => n > 0);
  const timeOfDay: MoodSpec["timeOfDay"] =
    timeHits.length === 0
      ? "mixed"
      : timeHits.length > 2
        ? "mixed"
        : [...timeHits].sort((a, b) => b[1] - a[1])[0][0];
  const seasonHits = SEASON_STEMS.map(
    ([k, st]) => [k, countStems(tokens, joined, st)] as const,
  )
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const season: MoodSpec["season"] = seasonHits[0]?.[0] ?? "unknown";
  if (timeOfDay === "night") warmth = clamp(warmth - 0.05);

  // 4. Места, люди, предметы
  const places = findFirst(tokens, PLACES);
  const people = findFirst(tokens, PEOPLE);
  const objects = findFirst(tokens, OBJECTS);

  // 5. Ключевые слова: предметы и места + частые «содержательные» слова
  const freq = new Map<string, number>();
  for (const t of tokens)
    if (t.length >= 5 && !STOP_WORDS.has(t))
      freq.set(t, (freq.get(t) ?? 0) + 1);
  const frequent = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  const keywords = [
    ...new Set([
      ...objects.map((o) => o.nom),
      ...places.map((p) => p.nom),
      ...frequent,
    ]),
  ].slice(0, 8);
  const emotionWords = emotions.map((e) =>
    ATMOSPHERE[e.emotion].split(" ").pop()!,
  );
  while (keywords.length < 3)
    keywords.push(
      emotionWords.shift() ?? ["день", "свет", "тишина"][keywords.length],
    );

  // 6. Подписи
  const primary = emotions[0].emotion;
  const secondary = emotions[1]?.emotion;
  const mixed =
    secondary !== undefined &&
    Math.sign(EMOTION_DIMS[primary][0]) !==
      Math.sign(EMOTION_DIMS[secondary][0]);
  const atmosphere = mixed ? "горько-сладкая" : ATMOSPHERE[primary];
  if (mixed)
    notes.push(
      "В тексте смешаны светлые и грустные чувства — атмосфера «горько-сладкая»",
    );

  const narrationTone: MoodSpec["narrationTone"] =
    tension > 0.6 && warmth < 0.45
      ? "cool-precise"
      : energy > 0.6
        ? "bright-fast"
        : valence < 0 && energy < 0.45
          ? "soft-quiet"
          : "calm-warm";

  // 7. Название: «[настроение] [сезон] время-суток [место] [с кем / и что]»
  const [noun, gender] = TIME_NOUN[timeOfDay];
  const seasonAdj = SEASON_ADJ[season];
  const moodAdj = MOOD_ADJ[primary];
  const place = places[0]?.phrase ?? "";
  const tail =
    people[0]?.phrase ??
    (objects[0] ? (objects[0].phrase ?? `и ${objects[0].nom}`) : "");
  const head = [
    seasonAdj ? adj(seasonAdj, gender) : adj(moodAdj, gender),
    noun,
  ].join(" ");
  const withMood = [
    adj(moodAdj, gender),
    seasonAdj ? adj(seasonAdj, gender) : "",
    noun,
  ]
    .filter(Boolean)
    .join(" ");
  const candidates = [
    [head, place, tail],
    [withMood, place, tail],
    [withMood, place],
    [withMood, tail],
    [withMood, "и", keywords[0]],
  ].map((parts) => parts.filter(Boolean).join(" "));
  const title = pickTitle(candidates, keywords);

  // 8. Уверенность: больше совпадений и длиннее текст — выше; фоллбек не выше 0.75
  const confidence = clamp(
    0.3 + 0.07 * Math.min(matched, 5) + (tokens.length > 40 ? 0.1 : 0),
    0.2,
    0.75,
  );
  if (tokens.length < 15)
    notes.push("Текст короткий — уверенность анализа снижена");

  return {
    version: 1,
    emotions,
    primary,
    secondary,
    valence: +clamp(valence, -1, 1).toFixed(2),
    energy: +clamp(energy).toFixed(2),
    tension: +clamp(tension).toFixed(2),
    warmth: +warmth.toFixed(2),
    atmosphere,
    timeOfDay,
    season,
    setting: places.map((p) => p.nom),
    people: people.map((p) => p.nom),
    keywords,
    title,
    narrationTone,
    contradiction: { present: false, note: "" },
    confidence: +confidence.toFixed(2),
    source: "fallback",
    fusionNotes: notes,
  };
}
