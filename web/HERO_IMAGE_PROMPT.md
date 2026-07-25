# Промпт для hero-картинки

## Куда положить готовый файл
- Папка: `web/public/assets/`
- Текущий файл фона: `call_rO5VaowuRxQJ39g98IFQI99m.png`
- Подключение в коде: `web/src/App.tsx`, строка 53 — `const HERO_MURAL = "/assets/<имя файла>.png";`
- CSS-класс: `.hero-mural` (полупрозрачная мурал-панорама, `opacity: 0.55`, вписана снизу по центру)

Замени файл с тем же именем — или положи новый и поменяй путь в `HERO_MURAL`.

## Стиль
Та же рисованная фреска / коллаж-мурал, что и на текущем фото: тёплая
бумажная палитра (терракота, охра, приглушённый зелёный), лёгкая
текстура, много воздуха сверху и по центру (там ложится текст и карточка),
основная композиция — вдоль нижнего края. Наложения-слои в одном стиле,
без резких контрастов, чтобы читался текст поверх.

## Что должно быть на картинке
- **Мадуро** — крупным планом, выступает на передний план; показан так,
  будто его связали / «повязали» (руки за спиной, наручники или верёвка).
- **Заместитель ФРС** — фигура в деловом костюме, повторяется в разных
  местах композиции (несколько раз по кадру).
- **Иранский залив** — сделать меньше по размеру, увести на второй план.
- **Илон Маск и его ракеты** — добавить: фигура Маска + стартующие ракеты
  (Starship/Falcon), как отдельный смысловой блок.

## Технические требования
- Ориентация: горизонтальная, широкий формат (панорама), ~2400×1200 px+.
- Формат: PNG.
- Композиция «вдоль низа», центр и верх свободные под текст.
- Тёплая палитра под сайт: терракота `#8d5635`, зелёный, бумажный фон `#f3e5c8`.

## Готовый промпт (для генератора изображений)
```
Wide horizontal hand-painted fresco-style political mural collage, warm
paper palette (terracotta, ochre, muted green), soft grain texture,
layered overlays in a single cohesive style. Foreground: Venezuelan
president Maduro in close-up, hands bound behind his back with rope/
handcuffs, prominent. A U.S. Federal Reserve deputy figure in a business
suit repeated in several places across the scene. A small Persian Gulf /
Iran map element pushed to the background, reduced in size. Elon Musk
with launching rockets (Starship/Falcon) as a separate motif. Empty
airy space in the center and top for overlaid headline text. Composition
anchored along the bottom edge. Muted contrast, editorial illustration,
2400x1200.
```
