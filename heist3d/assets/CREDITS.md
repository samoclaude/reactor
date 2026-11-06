# Источники ассетов

Всё ниже можно использовать и выкладывать в открытом репозитории.

## Текстуры (CC0, https://polyhaven.com/license)
- Паркет ёлочкой — Poly Haven `herringbone_parquet`
- Деревянные панели — Poly Haven `wooden_panels`
- Кессонный потолок — Poly Haven `dark_paneled_wood`
- Жаккард стен (перекрашен) — Poly Haven `quatrefoil_jacquard_fabric`
- Мрамор — Poly Haven `marble_01`

## Модели (CC0, Poly Haven)
`fancy_picture_frame_01`, `potted_plant_01`, `marble_bust_01`, `wooden_bookshelf_worn`, `book_encyclopedia_set_01`,
`antique_ceramic_vase_01`, `vintage_grandfather_clock_01`, `ornate_mirror_01`, `lion_head`, `kite_shield`,
`brass_candleholders`, `ClassicConsole_01`, `Chandelier_01`, `vintage_radio_transceiver`, `security_camera_02`.
Сжаты gltf-transform (meshopt, WebP), у тяжёлых упрощена геометрия.

## Свои модели (CC0)
`piano`, `violin`, `owl`, `dino`, `safe`, `vault`, `wardrobe`, `drape`, `van_ext` — построены скриптами Python в Blender 4.5
(Claude, 06.11.2026), без чужих ассетов и текстур, сжаты gltf-transform meshopt. Скрипты укрытий и фургона — в `tools/models/`.
У `book_encyclopedia_set_01`, `Chandelier_01`, `lion_head`, `security_camera_02` геометрия упрощена в Blender (Decimate) ради скорости.

## Охранник (CC0, Quaternius)
- Universal Base Characters (`Superhero_Male_FullBody`) — https://quaternius.itch.io/universal-base-characters
- Universal Animation Library (клипы Walk_Loop, Idle_Torch_Loop, Pistol_Aim_Neutral, Sprint_Loop, Idle_Loop) — https://quaternius.itch.io/universal-animation-library
Форма охранника нарисована поверх текстуры тела в игре (guard.js).

## Код
- three.js r187 — MIT, `vendor/three/LICENSE`
