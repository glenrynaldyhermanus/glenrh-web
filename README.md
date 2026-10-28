# The Book of Glen

The portfolio of Glen Rynaldy Hermanus at [glenrh.com](https://glenrh.com), told as an interactive picture book.
Plain HTML, CSS and JavaScript: no framework and no build step.

The previous campsite version is tagged `v1-campsite` in git.

## Run it

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. Opening the files straight from disk won't work, because pages use absolute paths and ES modules.

## How the book works

- **Every page is a real HTML file** (`/me/index.html`, `/work/hris/index.html`, …), so plain Nginx serves it and the site works without JavaScript.
- **Page turns.** `assets/js/app.js` intercepts internal links, fetches the next page, and swaps only `<main id="main">` inside a View Transition. The page curls forward or back depending on `data-folio`. Without View Transitions it fades; with *reduce motion* it swaps instantly.
- **The narrator.** `assets/js/narrator.js` keeps one 3D Glen (Three.js, `glbs/glenv2.min.glb`) alive across pages. He moves into whichever `[data-narrator-slot]` is visible, changes pose per story beat and speaks in a bubble. If WebGL or the model fails, a poster image stays instead.
- **Story beats.** `assets/js/story.js` watches `.beat` elements. When one reaches the middle of the screen, Glen plays its `data-pose` and says its `data-say`.
- **Keyboard and swipe.** ← and → turn pages using `data-prev` and `data-next` on `<main>`. The Contents button opens the table of contents from `assets/js/config.js`.

Poses: `sit` (on a stack of books), `read` (cross-legged), `wave`, `hey`, `walk`, `run` (page turns) and `dance`.

## Structure

| Path | What it is |
| --- | --- |
| `index.html` | Cover and prologue |
| `me/` | Chapter One |
| `work/` | Chapter Two: the list plus one folder per story |
| `playground/` | Chapter Three: the list plus one folder per mini app |
| `hire-me/` | Epilogue, with the letter form |
| `404.html` | Missing page |
| `robots.txt`, `sitemap.xml` | For search engines |
| `deploy/nginx.conf` | Server config, mounted into the container (not served) |
| `assets/css/` | `tokens` (colours, type, spacing), `base`, `book` (spreads, narrator, page turns), `components`, `chapters`, `playground` |
| `assets/js/` | `app` (router), `narrator`, `story`, `config` (contact + contents), `hire`, and `apps/` for the mini apps |
| `assets/img/` | Chapter plates, work images, `icons.svg` sprite, favicon, OG image |
| `assets/fonts/` | Bagel Fat One and Literata, self-hosted (OFL), declared in `tokens.css` |
| `glbs/glenv2.min.glb` | The production 3D Glen. `glenv2.glb`, `glen.glb` and `fbxs/` are source files and are not deployed. |

## Add a story to Chapter Two

1. Copy `work/devant/` to `work/<slug>/` and rewrite the four beats: the setting, the quest, the craft, the ending.
2. On `<main>`, set `data-folio` (the next odd number), `data-prev` and `data-next`. Update the neighbours' `data-prev`/`data-next` and their pager links.
3. Add a row to the list in `work/index.html` and an entry under Chapter Two in `assets/js/config.js` (the Contents dialog is built from it).
4. Put images in `assets/img/work/` as WebP, with `width`, `height` and real `alt` text.

Keep client work general: describe the problem and the craft, and use illustrations instead of internal screenshots.

## Add a mini app to Chapter Three

1. Copy `playground/glen-pet/` and point `data-module` on `<main>` at `/assets/js/apps/<slug>.js`.
2. The module exports `mount(main, { narrator })` and may return a cleanup function, which runs when the visitor turns the page:

   ```js
   export function mount(main, { narrator }) {
     const app = main.querySelector('[data-app="my-app"]');
     narrator.cue({ pose: "wave", say: "Hello!" });
     narrator.react("dance");           // short reaction, then back to the beat's pose
     const t = setInterval(tick, 1000);
     return () => clearInterval(t);
   }
   ```

3. Mark the app container with `data-no-swipe` so swipes inside it don't turn the page, and include an `.app__nojs` message.

## Writing style

The words are part of the design: short sentences, sentence case, plain English. Pink is only for buttons, focus and active states; blue and green are for illustration and chapter colour.

## Deploy

`../deploy-glenrh.sh web` rsyncs this folder to the server (`/opt/glenrh-web`) and serves it with an `nginx:alpine` container using `deploy/nginx.conf`. That config turns on gzip, serves `404.html` for unknown paths, caches images and the model for a week, and makes pages, CSS and JS revalidate on every visit. The script checks the config with `nginx -t` before it touches the running container.

Because images are cached for a week, give a changed image a new file name instead of overwriting it. When you add a page, add it to `sitemap.xml` too.
