# App icons

Made 2026-10-05 from Guy's logo (white FITNESS BLUEPRINT on black, blue
bars; 1080x1080 JPG Carl sent), cropped with sharp:

- `icon-192.png`, `icon-512.png` — logo fills ~82% of the width (crop
  182,182 717x717), so it reads at home-screen size.
- `icon-maskable-512.png` — wider crop (90,90 900x900) so the whole logo
  sits inside Android's 80% safe circle for round/squircle masks.
- `src/app/apple-icon.png` (180, iPhone home screen) and
  `src/app/icon.png` (browser tab) — same crop as icon-512; Next.js links
  them automatically from the app folder.

Black background to match the app (theme_color #000000). To redo them,
crop the same regions from a new square source image.
