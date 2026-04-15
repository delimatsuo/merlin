/**
 * Popup script — renders extension status and controls.
 */

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = "Pronto";
  }
});
