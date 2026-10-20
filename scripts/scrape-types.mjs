import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_URL = "https://pokeapi.co/api/v2/type";
const OUTPUT_DIR = path.resolve("data");

const SPRITE_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-viii/sword-shield";

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Fetch the complete list of types.
  const listResponse = await fetch(`${API_URL}?limit=100`);

  if (!listResponse.ok) {
    throw new Error(`Failed to fetch type list: ${listResponse.status}`);
  }

  const typeList = await listResponse.json();

  // Fetch details for each type.
  const types = await Promise.all(
    typeList.results.map(async (entry) => {
      const response = await fetch(entry.url);

      if (!response.ok) {
        throw new Error(`Failed to fetch type: ${entry.name}`);
      }

      const type = await response.json();

      return {
        id: type.id,
        name: type.name,
        sprite: `${SPRITE_BASE}/${type.id}.png`,
        standardSprite:
          `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-viii/sword-shield//${type.id}.png`,
        damageRelations: {
          doubleDamageTo: type.damage_relations.double_damage_to.map(
            (x) => x.name
          ),
          halfDamageTo: type.damage_relations.half_damage_to.map(
            (x) => x.name
          ),
          noDamageTo: type.damage_relations.no_damage_to.map(
            (x) => x.name
          ),
        },
      };
    })
  );

  const outputPath = path.join(OUTPUT_DIR, "types.json");

  await writeFile(
    outputPath,
    JSON.stringify(types, null, 2) + "\n",
    "utf8"
  );

  console.log(`Saved ${types.length} types to ${outputPath}`);
}

main().catch((error) => {
  console.error("Failed to scrape types:", error);
  process.exitCode = 1;
});
