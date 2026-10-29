# The Book of Glen

The portfolio of Glen Rynaldy Hermanus at [glenrh.com](https://glenrh.com), told as an interactive picture book.
Plain HTML, CSS and JavaScript: no framework and no build step.

The previous campsite version is tagged `v1-campsite` in git.

## Run it

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. Opening the files straight from disk won't work, because pages use absolute paths and ES modules.

To try the visitors' sticky notes as well, let the notes service serve the site instead. It needs Go 1.24 or newer and keeps its notes in `.notes/`, which git ignores:

```bash
cd notes-api && go run . -static .. -data ../.notes -port 5173
```

## How the book works

- **Every page is a real HTML file** (`/me/index.html`, `/work/hris/index.html`, …), so plain Nginx serves it and the site works without JavaScript.
- **Page turns.** `assets/js/app.js` intercepts internal links, fetches the next page, and swaps only `<main id="main">` inside a View Transition. The page curls forward or back depending on `data-folio`. Without View Transitions it fades; with *reduce motion* it swaps instantly.
- **The narrator.** `assets/js/narrator.js` keeps one 3D Glen (Three.js, `glbs/glenv2.min.glb`) alive across pages. He moves into whichever `[data-narrator-slot]` is visible, changes pose per story beat and speaks in a bubble. If WebGL or the model fails, a poster image stays instead.
- **Story beats.** `assets/js/story.js` watches `.beat` elements. When one reaches the middle of the screen, Glen plays its `data-pose` and says its `data-say`.
- **Sound.** `assets/js/sound.js` plays Tamengetit's theme (`assets/audio/theme.mp3`) quietly in the background, real page flips from Kenney's [RPG Audio](https://kenney.nl/assets/rpg-audio) (CC0) on every turn, and gives the narrator a game-style blip voice drawn with Web Audio. Nothing plays until the reader's first click, tap or key. The button in the top right corner mutes it and the choice is remembered. The games hold the music while they run.
- **Keyboard and swipe.** ← and → turn pages using `data-prev` and `data-next` on `<main>`. The Contents button opens the table of contents from `assets/js/config.js`.
- **The desk.** On the cover, Glen's phone lights up with a notification from one of his products every few seconds, each linking to its story. Sticky notes from readers sit on the other side: drag the top one by a corner to peel it off and it goes to the back of the pile. Both fade out as the book opens.
- **Sticky notes.** Readers leave a note (name, role, message) in the Visitors' Book. `notes-api/` appends it to `all.json`, the full archive, and rewrites `top.json` with the latest ten. Nginx serves `top.json` as a static file; `all.json` is never served. `assets/js/notes.js` draws the notes with `textContent` only, since the text comes straight from visitors. Notes go up without moderation; the service trims and length-checks them, ignores bots that fill the hidden `website` field, and allows one note a minute and ten a day per IP. To take a note down, delete it from `all.json` on the server; the next note rewrites `top.json`.

Poses: `sit` (on a stack of books), `read` (cross-legged), `wave`, `hey`, `walk`, `run` (page turns) and `dance`.

## Structure

| Path | What it is |
| --- | --- |
| `index.html` | Cover and prologue |
| `me/` | Chapter One |
| `work/` | Chapter Two: the list plus one folder per story |
| `playground/` | Chapter Three: the list plus one folder per mini app |
| `hire-me/` | Epilogue, with the letter form |
| `guestbook/` | Afterword: the Visitors' Book, with the board of notes and the note form |
| `notes-api/` | Go service that stores the sticky notes (blocked by Nginx, so its source is never served) |
| `games/` | Flutter web builds of Tamengetit and Lobby Land, embedded by their Playground pages |
| `404.html` | Missing page |
| `robots.txt`, `sitemap.xml` | For search engines |
| `deploy/nginx.conf` | Server config, mounted into the container (not served) |
| `assets/css/` | `tokens` (colours, type, spacing), `base`, `book` (spreads, narrator, page turns), `components`, `chapters`, `playground` |
| `assets/js/` | `app` (router), `narrator`, `story`, `sound`, `config` (contact + contents), `hire`, `notes` (sticky notes), and `apps/` for the mini apps |
| `assets/audio/` | Background music and page flips |
| `assets/img/` | Chapter plates, work images, `icons.svg` sprite, favicon, OG image |
| `assets/fonts/` | Bagel Fat One and Literata, self-hosted (OFL), declared in `tokens.css` |
| `glbs/glenv2.min.glb` | The production 3D Glen. `glenv2.glb`, `glen.glb` and `fbxs/` are source files and are not deployed. |

## Add a story to Chapter Two

1. Copy `work/shtev/` to `work/<slug>/` and rewrite the four beats: the setting, the quest, the craft, the ending.
2. On `<main>`, set `data-folio` (the next odd number), `data-prev` and `data-next`. Update the neighbours' `data-prev`/`data-next` and their pager links.
3. Add a row to the list in `work/index.html` and an entry under Chapter Two in `assets/js/config.js` (the Contents dialog is built from it).
4. Put images in `assets/img/work/` as WebP, with `width`, `height` and real `alt` text.

Lead with the business, not the stack: the list in `work/index.html` shows what each product does for whom. Use real product screens (never a login or splash screen) and keep private data out of them. Capture websites at full desktop width, for example 1440 by 900 at 2x.

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

### The notes service

The sticky notes need one more container next to `glenrh-web`, plus a named volume both of them mount. The rsync above already copies `notes-api/` to `/opt/glenrh-web/notes-api`. On the server:

```bash
docker volume create glenrh-notes
docker build -t glenrh-notes-api /opt/glenrh-web/notes-api
docker rm -f notes-api 2>/dev/null
docker run -d --name notes-api --restart unless-stopped \
  --network automation_app-network \
  -v glenrh-notes:/data/notes \
  glenrh-notes-api
```

Then `glenrh-web` needs the volume, read-only, so Nginx can serve `top.json`. Add this line to `run_web` in `deploy-glenrh.sh` and recreate the container once with `docker rm -f glenrh-web`:

```bash
-v glenrh-notes:/usr/share/nginx/notes:ro \
```

Nginx finds `notes-api` through Docker's DNS when a note is posted, so the site keeps working while the service is down; the board just shows the "be the first" note. It trusts `X-Forwarded-For` from private addresses (the TLS proxy on the Docker network) to rate-limit by visitor, not by proxy. Also add `--exclude '.notes'` to the rsync so local test notes never reach the server.

To read the archive: `docker run --rm -v glenrh-notes:/n alpine cat /n/all.json`.
