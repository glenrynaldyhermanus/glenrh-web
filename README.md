# Glen Rynaldy Hermanus — Personal Site

A static single-page personal site: no framework, no build step.
Sky and mountain use **smooth gradients**. Scene objects and UI use
**stylized vector + soft shading** and **dark glass** panels, plus a
**3D Glen character** (Three.js, `glbs/glenv2.min.glb`) sitting by the
campfire. The previous cel-shaded snapshot lives in `backup/cel-shaded/`.

## Run it

Open `index.html` in a browser, or serve locally:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Views (single page, hash routing)

| View | URL | Notes |
| ---- | --- | ----- |
| Home | `/` | Hero + campsite scene; Glen 3D sitting on a log by the fire |
| My Apps | `/#apps` | Zooms to Glen (stands up + waves); apps board slides in ([hris.glenrh.com](https://hris.glenrh.com)) |
| Contact | `/#contact` | Same zoom; Glen dances (random clip); glass ID card slides in |

Nav links **My Apps** / **Contact** trigger the zoom in place; the brand
mark or the board's **Back** button (and the browser back button) zoom
out — Glen sits back down via the reversed stand-up animation. While
zoomed, the camp props (cabin, fire, log, pines) fade out so only Glen
and the scenery remain.

## Structure

| File | Contents |
| ---- | -------- |
| `index.html` | All markup: sky, campsite scene, hero, apps board + ID card panels |
| `styles.css` | Night/day palettes, scene, zoom/board transitions, responsive rules |
| `main.js` | Star generator, parallax, shooting stars, and theme toggle |
| `glen-model.js` | Three.js: Glen GLB, log prop, lights, zoom camera, animation state machine, hash routing |
| `glbs/glenv2.glb` | Original Glen character (12 clips); kept as source |
| `glbs/glenv2.min.glb` | Production model: original mesh + WebP textures, ~2.4 MB |
| `backup/cel-shaded/` | Snapshot of the cel-shaded look (HTML/CSS/JS) |

## Theme toggle

Use the moon/sun button in the header to switch between night and day.
The choice is stored in `localStorage` under `glen-theme` (`night` or `day`).

In day mode the moon slides into a sun, sky gradients warm up, stars hide,
clouds and birds appear, and the campfire goes out (white smoke only).

## Customizing the look

All colors live as custom properties in `:root` inside `styles.css`:

- `--sky-zenith`, `--sky-mid`, `--sky-horizon`, `--glow-horizon` — smooth sky
  gradient (night: navy → cyan; day overrides under `html[data-theme="day"]`).
- `--mountain-peak`, `--mountain-mid`, `--mountain-base` — mountain SVG
  gradient.
- `--sky-1` … `--sky-6` — aliases still used by UI accents (e.g. highlight).
- `--gold`, `--aqua`, `--cream` — accent colors for stars, buttons, and labels.
- `--glass`, `--glass-border`, `--shadow` — frosted panel look (no ink outlines).

Star density is controlled by the `LAYERS` array in `main.js` (count, size range,
and sparkle count per layer).

## Notes

- Animations turn off automatically when the user has *reduce motion* enabled
  (theme swap becomes instant).
- Fonts load from Google Fonts; offline, the page still works with system fonts.
