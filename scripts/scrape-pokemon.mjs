import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://pokeapi.co/api/v2";
const OUTPUT_DIR = path.resolve("data");
const POKEMON_COUNT = 151;
const CONCURRENCY = 4;

async function getJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return response.json();
}

// Run several requests at once without starting all 151 together.
async function runPool(items, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function runWorker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, runWorker)
  );

  return results;
}

async function saveJSON(filename, data) {
  await writeFile(
    path.join(OUTPUT_DIR, filename),
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );

  console.log(`Saved data/${filename} (${data.length} records)`);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const ids = Array.from(
    { length: POKEMON_COUNT },
    (_, index) => index + 1
  );

  const results = await runPool(ids, async (id) => {
    console.log(`Fetching Pokémon ${id}/${POKEMON_COUNT}`);

    const [p, species, rawEncounters] = await Promise.all([
      getJSON(`${BASE_URL}/pokemon/${id}`),
      getJSON(`${BASE_URL}/pokemon-species/${id}`),
      getJSON(`${BASE_URL}/pokemon/${id}/encounters`),
    ]);

    const englishName =
      species.names.find((n) => n.language.name === "en")?.name
      ?? p.name;

    const pokemon = {
      id: p.id,
      name: englishName,
      slug: p.name,
      types: p.types.map((x) => x.type.name),
      height: p.height,
      weight: p.weight,
      baseExperience: p.base_experience,
      sprite: p.sprites.front_default,
      artwork:
        p.sprites.other?.["official-artwork"]?.front_default ?? null,
      abilities: p.abilities.map((x) => ({
        name: x.ability.name,
        isHidden: x.is_hidden,
        slot: x.slot,
      })),
    };

    const stats = {
      pokemonId: p.id,
      pokemon: p.name,
      ...Object.fromEntries(
        p.stats.map((x) => [x.stat.name, x.base_stat])
      ),
    };

    const speciesRecord = {
      id: species.id,
      name: species.name,
      captureRate: species.capture_rate,
      isLegendary: species.is_legendary,
      isMythical: species.is_mythical,
      evolutionChainUrl: species.evolution_chain.url,
    };

    const encounters = [];

    for (const area of rawEncounters) {
      for (const version of area.version_details) {
        if (version.version.name !== "firered") continue;

        for (const detail of version.encounter_details) {
          encounters.push({
            pokemonId: p.id,
            pokemon: p.name,
            area: area.location_area.name,
            areaUrl: area.location_area.url,
            method: detail.method.name,
            minLevel: detail.min_level,
            maxLevel: detail.max_level,
            chance: detail.chance,
            conditions: detail.condition_values.map(
              (x) => x.name
            ),
          });
        }
      }
    }

    return { pokemon, stats, species: speciesRecord, encounters };
  });

  const pokemon = results.map((x) => x.pokemon);
  const stats = results.map((x) => x.stats);
  const species = results.map((x) => x.species);
  const encounters = results.flatMap((x) => x.encounters);

  // Deduplicate abilities shared by multiple Pokémon.
  const abilityNames = [
    ...new Set(pokemon.flatMap((p) => p.abilities.map((a) => a.name))),
  ];

  const abilities = await runPool(abilityNames, async (name) => {
    const a = await getJSON(`${BASE_URL}/ability/${name}`);

    return {
      id: a.id,
      name: a.name,
      description:
        a.effect_entries.find((e) => e.language.name === "en")?.effect
        ?? "",
      shortDescription:
        a.effect_entries.find((e) => e.language.name === "en")?.short_effect
        ?? "",
      generation: a.generation.name,
    };
  });

  await Promise.all([
    saveJSON("pokemon.json", pokemon),
    saveJSON("stats.json", stats),
    saveJSON("species.json", species),
    saveJSON("abilities.json", abilities),
    saveJSON("encounters.json", encounters),
  ]);

  console.log("\nAll datasets generated successfully!");
}

main().catch((error) => {
  console.error("Could not generate datasets:", error);
  process.exitCode = 1;
});
