// Слой плёнки: зерно, засветы, ореол и виньетка.
import { H, W, type Scene } from "../types";
import { drawDust } from "../virtualCamera";

export function drawFilmLayer(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  t: number,
  amp: number,
) {
  const { grain, glow, vignette, weights } = s.style;

  // Засвет: тёплое пятно медленно ползёт по краю кадра
  if (glow > 0.1) {
    const lx = W * (0.85 + 0.25 * Math.sin(t * 0.23));
    const ly = H * (0.25 + 0.2 * Math.cos(t * 0.17));
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, W * 0.9);
    const a = glow * (0.28 + 0.1 * Math.sin(t * 0.9));
    g.addColorStop(0, `rgba(255,170,90,${a.toFixed(3)})`);
    g.addColorStop(0.5, `rgba(255,120,60,${(a * 0.35).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,120,60,0)");
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Плёночное «мерцание» яркости
  if (weights.film > 0.15) {
    const flick =
      (Math.sin(t * 23) * 0.5 + Math.sin(t * 7.3) * 0.5) * 0.025 * weights.film;
    ctx.fillStyle =
      flick > 0 ? `rgba(255,240,220,${flick})` : `rgba(0,0,0,${-flick})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Зерно: шумовая текстура со случайным сдвигом в каждом кадре; реагирует на громкость
  const ga = Math.min(0.6, grain * (0.55 + 0.4 * amp));
  if (ga > 0.03) {
    ctx.save();
    ctx.globalAlpha = ga;
    ctx.globalCompositeOperation = "overlay";
    const ox = Math.floor(Math.random() * 256),
      oy = Math.floor(Math.random() * 256);
    const pat = ctx.createPattern(s.grain, "repeat");
    if (pat) {
      ctx.translate(-ox, -oy);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W + 256, H + 256);
    }
    ctx.restore();
  }

  // Пыль в луче света: больше для «плёночных» и ностальгических дней
  drawDust(ctx, t, W, H, Math.min(1, weights.film * 1.2 + glow * 0.3), 7);

  // Виньетка
  const v = ctx.createRadialGradient(
    W / 2,
    H / 2,
    H * 0.3,
    W / 2,
    H / 2,
    H * 0.75,
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, `rgba(0,0,0,${(vignette * 0.65).toFixed(3)})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}
