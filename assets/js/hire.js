/**
 * Hire Me letter: validates, then composes a mailto: link so the visitor's own
 * email app sends it. Without JavaScript the form falls back to a plain mailto action.
 */
import { CONTACT } from "./config.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function mount(main, { narrator }) {
  const form = main.querySelector("[data-letter]");
  if (!form) return;
  const status = form.querySelector("[data-form-status]");

  const checks = [
    { input: form.querySelector("#f-name"), err: form.querySelector("#f-name-err"), ok: function (v) { return v.trim().length > 0; } },
    { input: form.querySelector("#f-email"), err: form.querySelector("#f-email-err"), ok: function (v) { return EMAIL_RE.test(v.trim()); } },
    { input: form.querySelector("#f-msg"), err: form.querySelector("#f-msg-err"), ok: function (v) { return v.trim().length >= 10; } }
  ];

  function validate(c) {
    const good = c.ok(c.input.value);
    c.input.setAttribute("aria-invalid", String(!good));
    c.err.hidden = good;
    return good;
  }

  checks.forEach(function (c) {
    c.input.addEventListener("blur", function () { if (c.input.value) validate(c); });
    c.input.addEventListener("input", function () { if (c.input.getAttribute("aria-invalid") === "true") validate(c); });
  });

  let started = false;
  form.addEventListener("input", function () {
    if (started) return;
    started = true;
    narrator.cue({ pose: "read", say: "Ooh, a letter. I'm reading over your shoulder." });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const bad = checks.filter(function (c) { return !validate(c); });
    if (bad.length) {
      bad[0].input.focus();
      status.textContent = bad.length === 1 ? "One thing to fix above." : bad.length + " things to fix above.";
      narrator.cue({ pose: "hey", say: "Almost! Check the red bits." });
      return;
    }

    const data = new FormData(form);
    const name = String(data.get("name")).trim();
    const type = String(data.get("type") || "Something else");
    const lines = [
      "Dear Glen,",
      "",
      String(data.get("message")).trim(),
      "",
      "Project type: " + type,
      "Start: " + data.get("when"),
      data.get("budget") ? "Budget: " + String(data.get("budget")).trim() : null,
      "",
      "Reply to: " + String(data.get("email")).trim(),
      "",
      "Best,",
      name,
      "",
      "(Sent from The Book of Glen)"
    ].filter(function (l) { return l !== null; });

    const subject = type + " project from " + name;
    const href = "mailto:" + CONTACT.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(lines.join("\n"));
    window.location.href = href;

    status.textContent = "Your email app should open with the letter ready. If nothing happens, copy my address below.";
    narrator.say("Letter ready! Press send in your mail app.");
    narrator.react("dance");
  });
}
