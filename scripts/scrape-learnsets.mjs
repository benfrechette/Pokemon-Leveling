import { mkdir, writeFile } from "node:fs/promises";

const BASE_URL = "https://pokeapi.co/api/v2";
const VERSION_GROUP = "firered-leafgreen";
const OUTPUT_DIR = new URL("../data/", import.meta.url);

async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }

  return response.json();
}

// Run a limited number of requests concurrently.
async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) return;

      results[index] = await callback(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log("Fetching Pokémon list...");

  const list = await fetchJSON(
    `${BASE_URL}/pokemon?limit=151`
  );

  const pokemonList = list.results;

  console.log(`Fetching ${pokemonList.length} Pokémon learnsets...`);

  const pokemonRecords = await mapWithConcurrency(
    pokemonList,
    5,
    async (item) => {
      const data = await fetchJSON(item.url);

      const moves = [];

      for (const entry of data.moves) {
        const details = entry.version_group_details.filter(
          (detail) =>
            detail.version_group.name === VERSION_GROUP
        );

        for (const detail of details) {
          moves.push({
            name: entry.move.name,
            move_url: entry.move.url,
            method: detail.move_learn_method.name,
            level: detail.level_learned_at,
          });
        }
      }

      return {
        id: data.id,
        name: data.name,
        moves,
      };
    }
  );

  // Gather unique move URLs so each move is fetched only once.
  const uniqueMoves = new Map();

  for (const p of pokemonRecords) {
    for (const move of p.moves) {
      uniqueMoves.set(move.move_url, move.name);
    }
  }

  console.log(`Fetching details for ${uniqueMoves.size} unique moves...`);

  const moveDetails = new Map();

  await mapWithConcurrency(
    [...uniqueMoves.keys()],
    5,
    async (url) => {
      const move = await fetchJSON(url);

      moveDetails.set(url, {
        type: move.type?.name ?? null,
        power: move.power,
        accuracy: move.accuracy,
        pp: move.pp,
        damage_class: move.damage_class?.name ?? null,
      });
    }
  );

  const output = pokemonRecords.map((p) => ({
    id: p.id,
    name: p.name,
    moves: p.moves.map((move) => ({
      name: move.name,
      method: move.method,
      level: move.level,
      ...(moveDetails.get(move.move_url) ?? {}),
    })).sort((a, b) => {
      const methodOrder = {
        "level-up": 0,
        machine: 1,
        tutor: 2,
        egg: 3,
      };

      const aOrder = methodOrder[a.method] ?? 4;
      const bOrder = methodOrder[b.method] ?? 4;

      if (aOrder !== bOrder) return aOrder - bOrder;

      if (a.method === "level-up" && b.method === "level-up") {
        return a.level - b.level;
      }

      return a.name.localeCompare(b.name);
    }),
  }));

  const outputPath = new URL("learnsets.json", OUTPUT_DIR);

  await writeFile(
    outputPath,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log(`Saved ${output.length} Pokémon to data/learnsets.json`);
  console.log(`Collected details for ${moveDetails.size} unique moves.`);
}

main().catch((error) => {
  console.error("Learnset scraping failed:", error);
  process.exitCode = 1;
});