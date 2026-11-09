# Источники ассетов

Всё ниже можно использовать и выкладывать в открытом репозитории.

## Текстуры (CC0, https://polyhaven.com/license)
- Паркет ёлочкой — Poly Haven `herringbone_parquet`
- Деревянные панели — Poly Haven `wooden_panels`
- Кессонный потолок — Poly Haven `dark_paneled_wood`
- Жаккард стен (перекрашен) — Poly Haven `quatrefoil_jacquard_fabric`
- Мрамор — Poly Haven `marble_01`
- Улица в меню и сценках (06.11.2026, сжаты до 512–1024 px): асфальт — `asphalt_02`, тротуар — `rectangular_paving`,
  гравий — `gravel_floor_02`, газон — `leafy_grass`, шифер крыши — `roof_slates_02`, песчаник особняка и ограды — `sandstone_blocks_08`
- Интерьеры новых зданий (08.11.2026, Poly Haven, 1k JPEG: `_col`, `_nrm`, `_arm`): `plastered_wall_04` → `plaster`, `white_stucco` → `stucco`,
  `granite_tile` → `granite`, `stone_tile_wall` → `stonewall`, `terrazzo_tiles` → `terrazzo`, `poly_wool_herringbone` → `carpet`,
  `white_plaster_02` → `plasterw`, `velour_velvet` → `velvet`, `black_walnut_veneer_01` → `walnut`

## Модели (CC0, Poly Haven)
`fancy_picture_frame_01`, `potted_plant_01`, `marble_bust_01`, `wooden_bookshelf_worn`, `book_encyclopedia_set_01`,
`antique_ceramic_vase_01`, `vintage_grandfather_clock_01`, `ornate_mirror_01`, `lion_head`, `kite_shield`,
`brass_candleholders`, `ClassicConsole_01`, `Chandelier_01`, `vintage_radio_transceiver`, `security_camera_02`, `classic_laptop` (ноутбук в фургоне).
Сжаты gltf-transform (meshopt, WebP), у тяжёлых упрощена геометрия.

## Модели новых зданий (08.11.2026, CC0, Poly Haven)
Файл (`assets/models/<имя>.glb`) ← модель Poly Haven. Сжаты gltf-transform (WebP 512–768–1024 px, meshopt).
`frame2` ← `fancy_picture_frame_02`*, `statue` ← `gothic_statue`*, `horse` ← `horse_statue_01`*, `whale` ← `bronze_whale_statue`,
`elephant` ← `carved_wooden_elephant`, `katana_stand` ← `katana_stand_01`, `katana` ← `antique_katana_01`, `meteor` ← `moon_rock_03`,
`spinning` ← `spinning_wheel_01`*, `chest` ← `treasure_chest`*, `cabinet_gothic` ← `GothicCabinet_01`, `plant2` ← `potted_plant_02`*,
`wallclock` ← `wall_clock`, `register` ← `CashRegister_01`, `sofa` ← `Sofa_01`, `bull` ← `bull_head`*, `coffee` ← `CoffeeCart_01`*,
`drawers` ← `vintage_wooden_drawer_01`, `chandelier2` ← `Chandelier_02`*, `cabinet_vintage` ← `vintage_cabinet_01`*, `cactus` ← `potted_plant_04`,
`dartboard` ← `dartboard`, `screen` ← `projector_screen`, `lounge` ← `mid_century_lounge_chair`, `shelves` ← `steel_frame_shelves_03`,
`mantelclock` ← `mantel_clock_01`*, `vase_brass` ← `brass_vase_01`*, `armchair` ← `ArmChair_01`,
`tea` ← `tea_set_01`*, `sidetable` ← `side_table_tall_01`, `chandelier3` ← `Chandelier_03`*.
\* — геометрия упрощена в Blender (Decimate) до 6–10 тыс. треугольников.
`tea` — чайник и две чашки с блюдцами, собраны в одну группу (остальной сервиз убран).

## Свои модели (CC0)
`piano`, `violin`, `owl`, `dino`, `safe`, `vault`, `wardrobe`, `drape`, `van_ext`, `street` — построены скриптами Python в Blender 4.5
(Claude, 06.11.2026), без чужих ассетов и текстур, сжаты gltf-transform meshopt. Скрипты укрытий, фургона и улицы — в `tools/models/`.
`street` — особняк, ограда, ворота, фонари, деревья, кусты, урна, скамейка, гидрант; `van_ext` с 06.11 — с задними створками и рабочим местом штурмана внутри.
У `book_encyclopedia_set_01`, `Chandelier_01`, `lion_head`, `security_camera_02` геометрия упрощена в Blender (Decimate) ради скорости.
Для новых зданий (08.11.2026, тоже скрипты Blender 4.5, без чужих ассетов): банк и офис — `atm`, `cooler`, `flag`, `printer`, `aquarium`, `tv`,
`sofa_modern`, `whiteboard`, `bicycle`, `floorlamp`, `locker`, `deposit` (`tools/models/props_city.py`); ювелирка и музей — `showcase`, `necklace`,
`crown`, `peacock`, `scales`, `jeweler`, `telescope`, `masks`, `globe` (`tools/models/props_luxe.py`); фасады музея, банка, офиса и ювелирки — `facades`
(`tools/models/facades.py`).

## Охранник (CC0, Quaternius)
- Universal Base Characters (`Superhero_Male_FullBody`) — https://quaternius.itch.io/universal-base-characters
- Universal Animation Library (клипы Walk_Loop, Idle_Torch_Loop, Pistol_Aim_Neutral, Sprint_Loop, Idle_Loop) — https://quaternius.itch.io/universal-animation-library
Форма охранника нарисована поверх текстуры тела в игре (guard.js).
- Вор и штурман в меню и сценках (`assets/crew/thief.glb`, `nav.glb`, 07.11.2026) — одежда Modular Character Outfits - Fantasy [Standard]
  (наряды Male_Ranger и Male_Peasant, CC0) — https://quaternius.itch.io/modular-character-outfits-fantasy ; голова, глаза, брови
  и причёска Hair_Buzzed — из Universal Base Characters. Собраны и перекрашены скриптом `tools/models/crew.py` (вор — в чёрное,
  балаклава и перчатки; штурману светлые штаны — в джинсу), наплечник и наручи убраны, сапоги упрощены, текстуры 1024 WebP.

## Звуки (CC0, Freesound, https://creativecommons.org/publicdomain/zero/1.0/)
Нарезаны из превью ffmpeg (06.11.2026): моно 96 кбит/с, петли — склейка хвоста с началом.
- `steps_runner` — «Footsteps_sneakers on wood» (speedygonzo) — https://freesound.org/s/235718/
- `steps_guard` — «Footsteps, Solid Wood Rug, Male Boots» (SpliceSound) — https://freesound.org/s/150444/
- `steps_runner_stone` — «Footsteps, Tile, Male Tennis Shoes, Fast Pace.wav» (SpliceSound) — https://freesound.org/s/170501/
- `steps_runner_carpet` — «Footsteps Carpet» (LewisEmmott5) — https://freesound.org/s/732573/
- `steps_guard_stone` — «boots on tile stone footsteps reverb.wav» (vestibule-door) — https://freesound.org/s/669070/
- `key` — «Keypad» (Ultra-Edward) — https://freesound.org/s/840450/
- `denied` — «acess denied buzz» (Jacco18) — https://freesound.org/s/419023/
- `lock` — «Lock - strong door» (Vrymaa) — https://freesound.org/s/734641/
- `creak` — «gate big rusty metal door garage open heavy creak» (kyles) — https://freesound.org/s/637583/
- `door_metal` — «Creaky metal door with latch» (biphelps) — https://freesound.org/s/626512/
- `gate_wood` — «Wooden Gate» (RealSquink) — https://freesound.org/s/788015/
- `safe_click` — «Bank Vault Combination Lock Sound - V6» (Pixeliota) — https://freesound.org/s/678254/
- `safe_open` — «vault» (lezaarth) — https://freesound.org/s/445100/
- `snip` — «Cutting Clipping Wire Copper» — https://freesound.org/s/383449/
- `alarm` — «burglar alarm siren long alert warning sound 3» (vyclops) — https://freesound.org/s/717414/
- `paper` — «pickup_paper.wav» (slamaxu) — https://freesound.org/s/509878/
- `rain_house` — «rain against window 2» (bastipictures) — https://freesound.org/s/243781/
- `rain_van` — «Hard Rain on Car Roof» (eRobb4) — https://freesound.org/s/344460/
- `hum` — «BPSN electrical hum 2» (chungus43A) — https://freesound.org/s/721813/
- `street_rain` — «Light rain on street» (BonnyOrbit) — https://freesound.org/s/380651/
- `crickets` — «Night crickets» (Vrymaa) — https://freesound.org/s/734642/
- `snow` — «Snow Falling In Scotland» (BurghRecords) — https://freesound.org/s/551118/
- `storm_rain` — «Rain heavy 2 (rural)» (jmbphilmes) — https://freesound.org/s/200272/
- `wind` — «Wind window strong gusts cold» (TRP) — https://freesound.org/s/574562/
- `thunder1` — «Thunder strike» (AyaDrevis) — https://freesound.org/s/652690/
- `thunder2` — «Short_Thunder_Mid» (SholeColtis) — https://freesound.org/s/683421/
- `thunder_crack` — «Close lightning strike 2018 07 07» (csengeri) — https://freesound.org/s/434359/ (кусок 2,0–3,0 с)
- `car_dry`, `car_wet` (вместе с «car arriving at the crossways on a wet street», launemax — https://freesound.org/s/249916/) — «CarArriveAndStop» (jmdh) — https://freesound.org/s/136536/
- `car_snow` — «Renault Duster coming to snow, engine stop» (semenov_nick) — https://freesound.org/s/380718/
- `car_away` — «Car_StartDriveAway» (kbnevel) — https://freesound.org/s/119829/
- `van_open`, `van_close` — «Vehicle_Car_Peugeot_Bipper_Sliding_Door» (Nox_Sound) — https://freesound.org/s/558144/
- `walk_street` — «footsteps pavement street» (Yuval) — https://freesound.org/s/205817/
- `walk_snow` — «Footsteps_Mountain_Boots_Snow_Walk» (Nox_Sound) — https://freesound.org/s/613849/
- `run_street` — «Footsteps Running Away Fading 1» (Rudmer_Rotteveel) — https://freesound.org/s/316923/
- `breaker` — «switch big breaker metal click on, off» (kyles) — https://freesound.org/s/451933/
- `radio` — «Walkie_Talkie_Static» (crcavol) — https://freesound.org/s/154654/
- `squelch` — «Radio Sign Off / Squelch» — https://freesound.org/s/524205/
- `jewel` — «Jewelry-003» (MaGs_007) — https://freesound.org/s/349363/
- `tick` — «clock-tick-01» (pbimal) — https://freesound.org/s/534094/
- `wardrobe` — «Wooden_Door_Squeak_04» (BlondPanda) — https://freesound.org/s/778462/
- `curtain` — «Curtain.wav» (Pipelenisf) — https://freesound.org/s/560344/
- `servo` — «Servo motor» (Burningmonkey) — https://freesound.org/s/322021/
- `flash` — «Flashlight Switch» (Lunardrive) — https://freesound.org/s/48979/
- `cello` — «cello drone» (carrieedick) — https://freesound.org/s/465558/
- `heart` — «Heartbeats 61» (patobottos) — https://freesound.org/s/369017/
- `clock` — «Tick-Tock - Pendulum Family Clock» (Vrymaa) — https://freesound.org/s/797574/
- `cough1` — «Man Coughing Cough» — https://freesound.org/s/383783/
- `cough2`, `cough3` — «Man clearing throat, coughing» (jasonLON) — https://freesound.org/s/125403/
- `cloth1`, `cloth2` — «Foley_Cloth_Movement_Jacket» (Nox_Sound) — https://freesound.org/s/555307/
- `battery_swap` — «Flashlight battery compartment unscrew» (Sadiquecat) — https://freesound.org/s/706440/ и «Calculator_Insert_Batteries_01» (nodzSound) — https://freesound.org/s/506532/
- `zap` — «ELECTRIC_ZAP_001» (JoelAudio) — https://freesound.org/s/136542/
- `spark` — «Electrical Shock (Zap)» (BigKahuna360) — https://freesound.org/s/160421/
- `run_snow` — «Running on snow» (AudioPapkin) — https://freesound.org/s/712022/
- `rain_van_light` — «rainoncarroof» (Spandau) — https://freesound.org/s/40700/
- `chair1`, `chair2` — «moving around in squeaky office chair» (romeoplank) — https://freesound.org/s/338143/
- `button` — «rubber button on electric device» (ShJafari) — https://freesound.org/s/747199/
- `plug` — «Plugging Cable 2» (Sheyvan) — https://freesound.org/s/523612/ (кусок 1,98–2,38 с)
- `laptop_key` — «keypress.wav» (CaptainYulef) — https://freesound.org/s/641243/
- `access` — «Code, Access Granted» (LilMati) — https://freesound.org/s/523094/ (вторая часть, 1,93–2,84 с)
- `page` — «Singular Page Turn» (Flem0527) — https://freesound.org/s/630019/
- `van_radio` — «Foley_Object_Small_Radio_Interference_Loop_Mono_01» (Nox_Sound) — https://freesound.org/s/561849/
- `menu_music` — музыка в меню, «SHADY» (MadGravityStudio) — https://freesound.org/s/789664/ (CC0; петля ровно 32 такта, 0–72,45 с, стерео)
- `timer_music` — «Orchestral Suspense Loop 1» (awrmacd) — https://freesound.org/s/387223/ (CC0; кусок 0–72 с, по громкости как музыка меню)
- В `radio_talk` щелчки рации — «Radio Sign Off / Squelch» (см. `squelch`)

## Голос охранника и дежурного (ElevenLabs, 06.11.2026)
`guard_who` («Кто здесь?»), `guard_stop` («Стоять! Руки вверх!») и `radio_talk` (переговоры по рации) озвучены ElevenLabs, модель eleven_v4,
голоса «Mikhail - confident and emotional» (охранник) и «Sergey Koshkin Pro» (дежурный). Рация — фильтры ffmpeg поверх.
Озвучка ElevenLabs (elevenlabs.io); на бесплатном тарифе — для некоммерческого использования с указанием ElevenLabs.

## Код
- three.js r187 — MIT, `vendor/three/LICENSE`
