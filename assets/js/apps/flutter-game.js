/* Flutter web games: the build is ~15 MB, so the iframe only loads after Play. */

export function mount(main, { narrator }) {
  const app = main.querySelector("[data-app='game']");
  if (!app) return;
  const stage = app.querySelector("[data-stage]");
  const play = app.querySelector("[data-play]");
  const status = app.querySelector("[data-status]");
  const name = app.dataset.name || "the game";
  let frame = null;

  function start() {
    if (frame) return;
    frame = document.createElement("iframe");
    frame.className = "game__frame";
    frame.src = app.dataset.src;
    frame.title = name;
    frame.allow = "autoplay; fullscreen";
    frame.addEventListener("load", function () {
      status.textContent = name + " is running. Click inside it to play.";
      frame.focus();
    });
    stage.replaceChildren(frame);
    status.textContent = "Loading " + name + "\u2026";
    narrator.react("dance");
  }

  play.addEventListener("click", start);

  return function () {
    play.removeEventListener("click", start);
    if (frame) frame.remove();
    frame = null;
  };
}
