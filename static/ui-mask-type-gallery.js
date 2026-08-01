// UI.maskTypeGallery(container, types, onSelect): renders a small card grid for choosing what
// kind of layer to use as a mask (layer-masking-system feature, timeline "+ Add mask" flow).
// `types` is [{value, icon, label}]; only "shape" exists today (see static/timeline.js's
// renderOverlaysRow), but the grid is built generically so text/person mask sources can be
// added later as more cards without restructuring this file. Depends on UI.icon only.
window.UI = window.UI || {};

window.UI.maskTypeGallery = function maskTypeGallery(container, types, onSelect) {
  container.innerHTML = "";
  container.classList.add("mask-type-gallery");
  types.forEach((t) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mask-type-gallery-card";
    card.innerHTML = `${UI.icon(t.icon, { size: 20 })}<span>${t.label}</span>`;
    card.addEventListener("click", () => onSelect(t.value));
    container.appendChild(card);
  });
};
