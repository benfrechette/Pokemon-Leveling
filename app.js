const pokedex = document.querySelector("#pokedex");
const progress = document.querySelector("#progress");

// Demo progress state. This resets on page refresh.
const caught = new Set();

async function init() {
  try {
    // Load Pokémon and type data at the same time
    const [pokemonResponse, typesResponse] = await Promise.all([
      fetch("./data/pokemon.json"),
      fetch("./data/types.json"),
    ]);

    if (!pokemonResponse.ok) {
      throw new Error("Could not load pokemon.json");
    }

    if (!typesResponse.ok) {
      throw new Error("Could not load types.json");
    }

    const pokemon = await pokemonResponse.json();
    const types = await typesResponse.json();

    function render() {
      progress.textContent =
        `${caught.size} / ${pokemon.length} Pokémon caught`;

      pokedex.innerHTML = pokemon.map((p) => `
        <article class="pokemon-card">
          <div class="sprite-type">
            <img
            src="${p.sprite || p.artwork || ""}"
            alt="${p.name}"
            class="pokemon-sprite"
            loading="lazy"
            >
            <div class="pokemon-types">
              ${p.types.map((typeName) => {
                const type = types.find(
                  (t) => t.name === typeName
                );

                if (!type) {
                  return `<span>${typeName}</span>`;
                }

                return `
                  <img
                    src="${type.sprite}"
                    alt="${type.name}"
                    title="${type.name}"
                    class="type-badge"
                  >
                `;
              }).join("")}
            </div>
          </div>
        
          <div class="num_name_check">
            <strong>
              ${String(p.id).padStart(3, "0")}
            </strong>

            <p>
              ${p.name}
            </p>

            <label>
              <input
                type="checkbox"
                data-id="${p.id}"
                ${caught.has(p.id) ? "checked" : ""}
              >
              Caught
            </label>
          </div>
        </article>
      `).join("");
    }

    pokedex.addEventListener("change", (event) => {
      const checkbox = event.target;

      if (!checkbox.matches('input[type="checkbox"]')) {
        return;
      }

      const id = Number(checkbox.dataset.id);

      if (checkbox.checked) {
        caught.add(id);
      } else {
        caught.delete(id);
      }

      render();
    });

    render();
  } catch (error) {
    progress.textContent = error.message;
    console.error(error);
  }
}


init();
