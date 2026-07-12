const panels = {
  film: document.getElementById("film"),
  "music-production": document.getElementById("music-production"),
  "graphic-design": document.getElementById("graphic-design"),
};

const filmTrack = document.querySelector("[data-film-track]");
const filmPrev = document.querySelector("[data-film-prev]");
const filmNext = document.querySelector("[data-film-next]");
const filmSlides = filmTrack ? [...filmTrack.children] : [];
let filmIndex = 0;

function updateFilmCarousel() {
  if (!filmTrack) return;

  filmTrack.style.transform = `translateX(-${filmIndex * 100}%)`;

  if (filmPrev) {
    filmPrev.disabled = filmIndex === 0;
  }

  if (filmNext) {
    filmNext.disabled = filmIndex === filmSlides.length - 1;
  }
}

function resetFilmCarousel() {
  filmIndex = 0;
  updateFilmCarousel();
}

function stopMusicPanel() {
  window.musicPanel?.stop();
}

function openPanel(id) {
  Object.entries(panels).forEach(([panelId, panel]) => {
    if (!panel || panelId === id) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  });

  if (id !== "music-production") {
    stopMusicPanel();
  }

  if (id === "film") {
    resetFilmCarousel();
  }

  const panel = panels[id];
  if (!panel) return;

  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("panel-open");
}

function closePanels() {
  Object.values(panels).forEach((panel) => {
    if (!panel) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  });
  document.body.classList.remove("panel-open");
  resetFilmCarousel();
  stopMusicPanel();
}

document.querySelectorAll("[data-close-panel]").forEach((button) => {
  button.addEventListener("click", closePanels);
});

document.querySelectorAll("[data-section]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openPanel(link.dataset.section);
  });
});

filmPrev?.addEventListener("click", () => {
  if (filmIndex > 0) {
    filmIndex -= 1;
    updateFilmCarousel();
  }
});

filmNext?.addEventListener("click", () => {
  if (filmIndex < filmSlides.length - 1) {
    filmIndex += 1;
    updateFilmCarousel();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePanels();
  }
});

if (window.location.hash) {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

updateFilmCarousel();
