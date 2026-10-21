const caught = new Set();

let pokemon = [];
let types = [];
let statsData = [];
let speciesData = [];
let abilitiesData = [];
let learnsets = [];

let typeByName = new Map();
let selectedEntry = null;
let activeSuggestionIndex = -1;

const $ = (selector) => document.querySelector(selector);

const pokedex = $("#pokedex");
const progress = $("#progress");

// ---------- General data helpers ----------

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function displayName(value) {
  return String(value ?? "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function toRecords(data) {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.pokemon)) return data.pokemon;
    return Object.entries(data).map(([key, value]) => {
      if (value && typeof value === "object") {
        return { _key: key, ...value };
      }
      return { _key: key, value };
    });
  }

  return [];
}

function recordMatches(record, p) {
  if (!record || !p) return false;

  const recordId = Number(
    record.id ?? record.pokemon_id ?? record.pokemonId ??
    record.pokedex_number ?? record._key
  );

  if (recordId && recordId === Number(p.id)) return true;

  const possibleNames = [
    record.name,
    record.pokemon,
    record.pokemon_name,
    record.slug,
    record._key,
  ].filter(Boolean).map(slugify);

  const targetNames = [
    p.name,
    p.slug,
  ].filter(Boolean).map(slugify);

  return possibleNames.some((name) => targetNames.includes(name));
}

function findRecord(data, p) {
  if (!data || !p) return null;

  // Handle objects indexed by Pokémon ID or name.
  if (!Array.isArray(data) && typeof data === "object") {
    const direct = data[p.id] ?? data[p.name] ?? data[p.slug];

    if (direct !== undefined) {
      return direct;
    }
  }

  return toRecords(data).find((record) => recordMatches(record, p)) ?? null;
}

function extractStats(p) {
  const record = findRecord(statsData, p);
  const raw = record?.stats ?? record?.base_stats ??
    record?.baseStats ?? record;

  if (!raw) return [];

  const aliases = {
    hp: ["hp", "HP"],
    attack: ["attack", "atk", "Attack"],
    defense: ["defense", "def", "Defense"],
    "special-attack": [
      "special-attack", "special_attack", "specialAttack", "sp_atk",
    ],
    "special-defense": [
      "special-defense", "special_defense", "specialDefense", "sp_def",
    ],
    speed: ["speed", "Speed", "spe"],
  };

  const output = [];

  for (const [name, keys] of Object.entries(aliases)) {
    let value;

    if (Array.isArray(raw)) {
      const item = raw.find((entry) =>
        keys.includes(entry.name) ||
        keys.includes(entry.stat) ||
        keys.includes(entry.stat_name)
      );

      value = item?.base_stat ?? item?.baseStat ?? item?.value;
    } else if (raw && typeof raw === "object") {
      for (const key of keys) {
        if (raw[key] !== undefined) {
          value = raw[key];
          break;
        }
      }
    }

    if (value !== undefined && Number.isFinite(Number(value))) {
      output.push({ name, value: Number(value) });
    }
  }

  return output;
}

function extractAbilities(p) {
  const record = findRecord(abilitiesData, p);
  const raw = record?.abilities ?? record?.data ?? record;

  if (Array.isArray(raw)) {
    return raw.map((ability) => {
      if (typeof ability === "string") {
        return { name: ability, isHidden: false };
      }

      return {
        name: ability.name ?? ability.ability?.name ?? "",
        isHidden: Boolean(ability.is_hidden ?? ability.isHidden),
        description: ability.description ?? "",
      };
    }).filter((ability) => ability.name);
  }

  if (p.abilities && Array.isArray(p.abilities)) {
    return p.abilities.map((ability) => ({
      name: typeof ability === "string"
        ? ability
        : ability.name ?? ability.ability?.name ?? "",
      isHidden: Boolean(ability.is_hidden ?? ability.isHidden),
      description: ability.description ?? "",
    })).filter((ability) => ability.name);
  }

  return [];
}

function extractDescription(p) {
  const record = findRecord(speciesData, p);

  if (!record) return "";

  if (typeof record.description === "string") {
    return record.description;
  }

  if (typeof record.flavor_text === "string") {
    return record.flavor_text;
  }

  if (typeof record.flavorText === "string") {
    return record.flavorText;
  }

  const entries = record.flavor_text_entries ??
    record.flavorTextEntries;

  if (Array.isArray(entries)) {
    const entry = entries.find((item) =>
      item.language === "en" ||
      item.language?.name === "en"
    );

    return entry?.flavor_text ?? entry?.text ?? "";
  }

  return "";
}

function getHeight(p) {
  const record = findRecord(speciesData, p) ?? p;
  const value = record.height;

  if (value === undefined || value === null) return "Unknown";

  // PokéAPI stores height in decimeters.
  return typeof value === "number"
    ? `${(value / 10).toFixed(1)} m`
    : String(value);
}

function getWeight(p) {
  const record = findRecord(speciesData, p) ?? p;
  const value = record.weight;

  if (value === undefined || value === null) return "Unknown";

  // PokéAPI stores weight in hectograms.
  return typeof value === "number"
    ? `${(value / 10).toFixed(1)} kg`
    : String(value);
}

// ---------- Navigation ----------

function showPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageId);
  });

  $("#navbar").classList.toggle("hidden", pageId === "home-page");

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

$("#home-logo").addEventListener("click", (event) => {
  event.preventDefault();
  showPage("home-page");
});

// ---------- Progress ----------

function updateBadgeStats() {
  const count = document.querySelectorAll(
    ".badge-checkbox:checked"
  ).length;

  $("#stats-badges").textContent = `${count} / 8`;
}

function updateProgress() {
  const total = pokemon.length;
  const count = caught.size;
  const remaining = Math.max(0, total - count);
  const percent = total ? Math.round((count / total) * 100) : 0;

  progress.textContent = `${count} / ${total} Pokémon caught`;
  $("#home-progress").textContent =
    `${count} / ${total} Pokémon caught (${percent}%)`;

  $("#home-progress-fill").style.width = `${percent}%`;
  $("#pokedex-progress-fill").style.width = `${percent}%`;

  $("#stats-caught").textContent = count;
  $("#stats-remaining").textContent = remaining;
  $("#stats-percent").textContent = `${percent}%`;

  updateBadgeStats();
}

document.querySelectorAll(".badge-checkbox").forEach((checkbox) => {
  checkbox.addEventListener("change", updateBadgeStats);
});

// ---------- Pokédex rendering ----------

function renderPokedex() {
  updateProgress();

  const query = $("#pokemon-search").value.trim().toLowerCase();
  const filter = $("#caught-filter").value;

  const filtered = pokemon.filter((p) => {
    const matchesQuery =
      p.name.toLowerCase().includes(query) ||
      String(p.id).includes(query);

    const isCaught = caught.has(Number(p.id));

    const matchesFilter =
      filter === "all" ||
      (filter === "caught" && isCaught) ||
      (filter === "uncaught" && !isCaught);

    return matchesQuery && matchesFilter;
  });

  if (!filtered.length) {
    pokedex.innerHTML = '<p class="empty-message">No Pokémon found.</p>';
    return;
  }

  pokedex.innerHTML = filtered.map((p) => {
    const badges = (p.types ?? []).map((name) => {
      const type = typeByName.get(name);

      return type?.sprite
        ? `<img class="type-badge" src="${escapeHTML(type.sprite)}"
             alt="${escapeHTML(name)}" title="${escapeHTML(name)}">`
        : `<span>${escapeHTML(name)}</span>`;
    }).join("");

    return `
      <article class="pokemon-card">
        <img class="pokemon-sprite"
          src="${escapeHTML(p.artwork || p.sprite || "")}"
          alt="${escapeHTML(p.name)}" loading="lazy">

        <strong class="pokemon-name">
          #${String(p.id).padStart(3, "0")} ${escapeHTML(displayName(p.name))}
        </strong>

        <div class="pokemon-types">${badges}</div>

        <label class="caught-label">
          <input type="checkbox" data-id="${Number(p.id)}"
            ${caught.has(Number(p.id)) ? "checked" : ""}>
          Caught
        </label>
      </article>
    `;
  }).join("");
}

pokedex.addEventListener("change", (event) => {
  const checkbox = event.target.closest('input[type="checkbox"][data-id]');
  if (!checkbox) return;

  const id = Number(checkbox.dataset.id);

  if (checkbox.checked) caught.add(id);
  else caught.delete(id);

  renderPokedex();
});

$("#pokemon-search").addEventListener("input", renderPokedex);
$("#caught-filter").addEventListener("change", renderPokedex);

// ---------- Entries autocomplete ----------

const entrySearch = $("#entry-search");
const suggestions = $("#entry-suggestions");
const entryDetails = $("#entry-details");
const entryStatus = $("#entry-status");

function closeSuggestions() {
  suggestions.classList.add("hidden");
  suggestions.innerHTML = "";
  entrySearch.setAttribute("aria-expanded", "false");
  activeSuggestionIndex = -1;
}

function findSuggestions(query) {
  const normalized = slugify(query);

  if (!normalized) return [];

  return pokemon
    .filter((p) =>
      slugify(p.name).includes(normalized) ||
      String(p.id) === normalized
    )
    .sort((a, b) => {
      const aName = slugify(a.name);
      const bName = slugify(b.name);

      const aStarts = aName.startsWith(normalized) ? 0 : 1;
      const bStarts = bName.startsWith(normalized) ? 0 : 1;

      return aStarts - bStarts || Number(a.id) - Number(b.id);
    })
    .slice(0, 10);
}

function renderSuggestions(matches) {
  if (!matches.length) {
    closeSuggestions();
    entryStatus.textContent = "No matching Pokémon found.";
    return;
  }

  suggestions.innerHTML = matches.map((p, index) => `
    <button
      type="button"
      role="option"
      aria-selected="false"
      class="suggestion-option"
      data-entry-id="${Number(p.id)}"
      id="entry-suggestion-${index}"
    >
      <img src="${escapeHTML(p.sprite || p.artwork || "")}"
        alt="" loading="lazy">
      <span class="suggestion-name">${escapeHTML(displayName(p.name))}</span>
      <span class="suggestion-number">
        #${String(p.id).padStart(3, "0")}
      </span>
    </button>
  `).join("");

  suggestions.classList.remove("hidden");
  entrySearch.setAttribute("aria-expanded", "true");
  activeSuggestionIndex = -1;
}

entrySearch.addEventListener("input", () => {
  const query = entrySearch.value.trim();

  if (!query) {
    closeSuggestions();
    entryDetails.innerHTML = "";
    entryStatus.textContent = "Start typing to find a Pokémon.";
    selectedEntry = null;
    return;
  }

  renderSuggestions(findSuggestions(query));
});

suggestions.addEventListener("click", (event) => {
  const option = event.target.closest("[data-entry-id]");
  if (!option) return;

  const selected = pokemon.find(
    (p) => Number(p.id) === Number(option.dataset.entryId)
  );

  if (selected) selectEntry(selected);
});

entrySearch.addEventListener("keydown", (event) => {
  const options = [...suggestions.querySelectorAll("[data-entry-id]")];

  if (event.key === "Escape") {
    closeSuggestions();
    return;
  }

  if (event.key === "ArrowDown" && options.length) {
    event.preventDefault();
    activeSuggestionIndex =
      (activeSuggestionIndex + 1) % options.length;
    updateActiveSuggestion(options);
  }

  if (event.key === "ArrowUp" && options.length) {
    event.preventDefault();
    activeSuggestionIndex =
      (activeSuggestionIndex - 1 + options.length) % options.length;
    updateActiveSuggestion(options);
  }

  if (event.key === "Enter") {
    event.preventDefault();

    if (activeSuggestionIndex >= 0 && options[activeSuggestionIndex]) {
      options[activeSuggestionIndex].click();
    } else {
      const exact = pokemon.find(
        (p) => slugify(p.name) === slugify(entrySearch.value)
      );

      if (exact) selectEntry(exact);
      else if (options.length === 1) options[0].click();
    }
  }
});

function updateActiveSuggestion(options) {
  options.forEach((option, index) => {
    const active = index === activeSuggestionIndex;
    option.setAttribute("aria-selected", String(active));

    if (active) option.scrollIntoView({ block: "nearest" });
  });
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".entry-search-wrap")) {
    closeSuggestions();
  }
});

// ---------- Entries profile ----------

function renderStatBars(stats) {
  if (!stats.length) {
    return '<p class="empty-message">Base stats are unavailable.</p>';
  }

  const labels = {
    hp: "HP",
    attack: "Attack",
    defense: "Defense",
    "special-attack": "Sp. Atk",
    "special-defense": "Sp. Def",
    speed: "Speed",
  };

  const total = stats.reduce((sum, stat) => sum + stat.value, 0);

  return stats.map((stat) => `
    <div class="stat-row">
      <span>${labels[stat.name] ?? escapeHTML(stat.name)}</span>
      <strong>${stat.value}</strong>
      <div class="stat-bar">
        <div class="stat-bar-fill"
          style="width:${Math.min(100, stat.value / 255 * 100)}%">
        </div>
      </div>
    </div>
  `).join("") + `
    <div class="stat-total">Total base stats: ${total}</div>
  `;
}

function renderAbilities(abilities) {
  if (!abilities.length) {
    return '<p class="empty-message">Ability details are unavailable.</p>';
  }

  return `
    <div class="ability-list">
      ${abilities.map((ability) => `
        <div class="ability-item">
          <strong>${escapeHTML(displayName(ability.name))}</strong>
          ${ability.isHidden ? '<span class="type-label">Hidden ability</span>' : ""}
          ${ability.description
            ? `<p>${escapeHTML(ability.description)}</p>`
            : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderTypeBadges(p) {
  return (p.types ?? []).map((name) => {
    const type = typeByName.get(name);

    return type?.sprite
      ? `<img class="type-badge" src="${escapeHTML(type.sprite)}"
           alt="${escapeHTML(name)}" title="${escapeHTML(name)}">`
      : `<span class="type-label">${escapeHTML(name)}</span>`;
  }).join("");
}

function normalizeMoveRecords(p) {
  const record = findRecord(learnsets, p);

  // learnsets.json is generated by the scraper below.
  const raw = Array.isArray(record)
    ? record
    : record?.moves ?? record?.learnset ?? [];

  return raw.map((move) => ({
    name: move.name ?? move.move?.name ?? "",
    method: move.method ?? move.learn_method ?? move.learnMethod ?? "",
    level: move.level ?? move.level_learned_at ?? move.levelLearnedAt ?? null,
    type: move.type ?? move.move_type ?? "",
    power: move.power ?? null,
    accuracy: move.accuracy ?? null,
    pp: move.pp ?? null,
    damageClass: move.damage_class ?? move.damageClass ?? "",
    machine: move.machine ?? null,
  })).filter((move) => move.name);
}

function methodLabel(method) {
  const labels = {
    "level-up": "Level-up",
    machine: "TM/HM",
    egg: "Egg",
    tutor: "Move tutor",
    "level_up": "Level-up",
  };

  return labels[method] ?? displayName(method || "Other");
}

function moveTypeLabel(type) {
  if (!type) return "—";

  const normalized = slugify(type);
  return `<span class="type-label type-${escapeHTML(normalized)}">
    ${escapeHTML(type)}
  </span>`;
}

function renderMoves(p, moves) {
  const methodSelect = $("#entry-move-method");
  const moveSearch = $("#entry-move-search");

  const selectedMethod = methodSelect?.value ?? "all";
  const query = (moveSearch?.value ?? "").trim().toLowerCase();

  const filtered = moves.filter((move) => {
    const matchesMethod =
      selectedMethod === "all" || move.method === selectedMethod;

    const matchesName = displayName(move.name).toLowerCase().includes(query);

    return matchesMethod && matchesName;
  });

  const table = filtered.length ? `
    <div class="table-wrap">
      <table class="move-table">
        <thead>
          <tr>
            <th>Move</th>
            <th>Method</th>
            <th>Level</th>
            <th>Type</th>
            <th>Power</th>
            <th>Accuracy</th>
            <th>PP</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((move) => `
            <tr>
              <td>${escapeHTML(displayName(move.name))}</td>
              <td>${escapeHTML(methodLabel(move.method))}</td>
              <td>${move.level == null ? "—" : escapeHTML(move.level)}</td>
              <td>${moveTypeLabel(move.type)}</td>
              <td>${move.power == null ? "—" : escapeHTML(move.power)}</td>
              <td>${move.accuracy == null ? "—" : escapeHTML(move.accuracy)}</td>
              <td>${move.pp == null ? "—" : escapeHTML(move.pp)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : '<p class="empty-message">No matching moves found.</p>';

  return `
    <div class="move-toolbar">
      <input id="entry-move-search" type="search"
        placeholder="Search moves..." value="${escapeHTML(query)}">

      <select id="entry-move-method" aria-label="Filter moves by method">
        <option value="all" ${selectedMethod === "all" ? "selected" : ""}>All methods</option>
        <option value="level-up" ${selectedMethod === "level-up" ? "selected" : ""}>Level-up</option>
        <option value="machine" ${selectedMethod === "machine" ? "selected" : ""}>TM/HM</option>
        <option value="egg" ${selectedMethod === "egg" ? "selected" : ""}>Egg</option>
        <option value="tutor" ${selectedMethod === "tutor" ? "selected" : ""}>Move tutor</option>
      </select>
    </div>

    <p class="move-count">Showing ${filtered.length} of ${moves.length} moves in FireRed/LeafGreen.</p>
    ${table}
  `;
}

function renderEntry(p) {
  const stats = extractStats(p);
  const abilities = extractAbilities(p);
  const description = extractDescription(p);
  const moves = normalizeMoveRecords(p);

  const speciesRecord = findRecord(speciesData, p);
  const profileHeight = speciesRecord?.height ?? p.height;
  const profileWeight = speciesRecord?.weight ?? p.weight;

  const heightText = profileHeight == null
    ? "Unknown"
    : typeof profileHeight === "number"
      ? `${(profileHeight / 10).toFixed(1)} m`
      : String(profileHeight);

  const weightText = profileWeight == null
    ? "Unknown"
    : typeof profileWeight === "number"
      ? `${(profileWeight / 10).toFixed(1)} kg`
      : String(profileWeight);

  entryDetails.innerHTML = `
    <div class="entry-profile">
      <aside class="entry-sidebar">
        <div class="entry-panel">
          <div class="entry-profile-heading">
            <img class="entry-profile-sprite"
              src="${escapeHTML(p.artwork || p.sprite || "")}"
              alt="${escapeHTML(p.name)}">

            <div>
              <span class="entry-number">
                #${String(p.id).padStart(3, "0")}
              </span>
              <h2 class="entry-name">${escapeHTML(displayName(p.name))}</h2>
              <div class="entry-types">${renderTypeBadges(p)}</div>
            </div>
          </div>

          <div class="entry-facts">
            <div class="entry-fact">
              <span>Height</span>
              <strong>${escapeHTML(heightText)}</strong>
            </div>
            <div class="entry-fact">
              <span>Weight</span>
              <strong>${escapeHTML(weightText)}</strong>
            </div>
          </div>

          ${description
            ? `<p class="entry-description">${escapeHTML(description)}</p>`
            : ""}
        </div>

        <div class="entry-panel">
          <h3>Base Stats</h3>
          ${renderStatBars(stats)}
        </div>
      </aside>

      <div class="entry-content">
        <div class="entry-panel">
          <h3>Abilities</h3>
          ${renderAbilities(abilities)}
        </div>

        <div class="entry-panel">
          <h3>Moves</h3>
          <div id="entry-moves">
            ${renderMoves(p, moves)}
          </div>
        </div>
      </div>
    </div>
  `;

  $("#entry-moves").addEventListener("input", (event) => {
    if (!event.target.matches("#entry-move-search")) return;
    refreshMoves(p);
  });

  $("#entry-moves").addEventListener("change", (event) => {
    if (!event.target.matches("#entry-move-method")) return;
    refreshMoves(p);
  });
}

function refreshMoves(p) {
  const container = $("#entry-moves");
  if (!container) return;

  // Keep the current filter/search values before rebuilding the table.
  const oldSearch = $("#entry-move-search")?.value ?? "";
  const oldMethod = $("#entry-move-method")?.value ?? "all";

  const moves = normalizeMoveRecords(p);

  container.innerHTML = renderMoves(p, moves);

  $("#entry-move-search").value = oldSearch;
  $("#entry-move-method").value = oldMethod;
}

function selectEntry(p) {
  selectedEntry = p;
  entrySearch.value = displayName(p.name);
  closeSuggestions();

  entryStatus.textContent =
    `Entry for ${displayName(p.name)} · FireRed/LeafGreen data`;

  renderEntry(p);
}

// ---------- Load local data ----------

async function fetchJSON(path, optional = false) {
  const response = await fetch(path);

  if (!response.ok) {
    if (optional) return [];
    throw new Error(`Could not load ${path} (${response.status}).`);
  }

  return response.json();
}

async function init() {
  try {
    const [
      pokemonJSON,
      typesJSON,
      statsJSON,
      speciesJSON,
      abilitiesJSON,
      learnsetsJSON,
    ] = await Promise.all([
      fetchJSON("./data/pokemon.json"),
      fetchJSON("./data/types.json"),
      fetchJSON("./data/stats.json", true),
      fetchJSON("./data/species.json", true),
      fetchJSON("./data/abilities.json", true),
      fetchJSON("./data/learnsets.json", true),
    ]);

    pokemon = toRecords(pokemonJSON)
      .filter((p) => p.name && p.id != null)
      .sort((a, b) => Number(a.id) - Number(b.id));

    types = toRecords(typesJSON);
    statsData = statsJSON;
    speciesData = speciesJSON;
    abilitiesData = abilitiesJSON;
    learnsets = learnsetsJSON;

    typeByName = new Map(types.map((type) => [type.name, type]));

    renderPokedex();
    updateProgress();

    if (!learnsets.length) {
      entryStatus.textContent =
        "Pokémon loaded. Generate data/learnsets.json to display FireRed/LeafGreen move lists.";
    }
  } catch (error) {
    console.error("Could not initialize the tracker:", error);
    progress.textContent = error.message;
    $("#home-progress").textContent = error.message;
    entryStatus.textContent = error.message;
  }
}

init();