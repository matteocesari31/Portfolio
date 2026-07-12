const panels = {
  film: document.getElementById("film"),
};

function openPanel(id) {
  const panel = panels[id];
  if (!panel) return;

  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("panel-open");
}

function closePanels() {
  Object.values(panels).forEach((panel) => {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  });
  document.body.classList.remove("panel-open");
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

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePanels();
  }
});

if (window.location.hash) {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}
