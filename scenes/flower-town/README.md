# 花店（flower-town）

一家 6 × 5 米的街角小花店，建在空间 `flower-town` 的地块 `shop`（6.4 × 7.4 米的虚拟区，南侧留 2 米街面做门廊）里。风格和布局参考「百花深」花店的设计（暖木、白墙、叠石、绿植），只保留两个分区：收银区、零售与花艺区，南墙正中出入口。它沿用查看器夹具「街角花店」的锚点和事件类型，用于 12-17 发布会的「来宾在花店订花篮、送到前厅」演示，也是之后给别的店铺照着建的样板。

| 临街 | 店内 | 俯视 |
|---|---|---|
| ![临街](preview/front.png) | ![店内](preview/left.png) | ![俯视](preview/top.png) |

## 里面有什么

x 向东 6 米、z 向南 5 米，北墙在 z = 0.2，墙厚 0.2 米，吊顶 3.0 米。

| 分区 | 范围（米） | 地面 | 主要物件 |
|---|---|---|---|
| 收银区 | x 3.2–6.0，z 0.4–2.0 | 橡木地板 | 橡木收银台（收银机、青花瓶、发布会花篮样品）、背柜、招牌，北墙贴叠石 |
| 零售与花艺区 | x 0.4–6.0，z 2.0–5.0 及西北角 | 橡木地板 | 西墙木格展示架、北墙书架、花艺工作台（花瓶、洒水壶、花篮）配藤椅、四个花桶、中央圆桌陈列岛（花瓶、花篮、酢浆草）加小木桌木箱、头顶花环、东墙层架、盆栽、两盏工业吊灯 |
| 门廊 | x 0.2–6.2，z 5.2–7.2 | 赤陶地砖 | 深色木柱、横梁和格栅，门头招牌带暖光灯带，两盏灯笼吊灯；右侧三级阶梯花架放 18 桶玫瑰（粉、白相间）、顶上灯箱，矮柜上三盆绣球；左侧花箱长春花、黑板、盆栽、木桶 |

吊顶是桧木板，两根深色木梁分出分区，6 盏筒灯；外墙白灰泥，四面有窗，南墙东侧是落地橱窗，门是两扇半开的木门。花团、玫瑰桶、绣球、筒灯、花环、招牌、收银台、花架和矮柜是参数形状。

- **锚点**（都是公开的）：

| 锚点 | 类型 | 用途 |
|---|---|---|
| `counter` | `counter` | 收银台，`delivery.sent` 的起点 |
| `door` | `door` | 出入口，组合里和前厅相连 |
| `window` | `zone` | 南墙东侧的落地橱窗 |
| `retail`、`floral` | `zone` | 零售区与花艺区（收银区由 `counter` 代表），给人流、营业状态一类事件挂 |

### 模型来源（`build/authored.json`，署名随物件记录进 `props.source`）

| 模型 | 作者 | 许可 | 来源页 |
|---|---|---|---|
| Cash Register 01 | Joe Seabuhr | CC0-1.0 | [CashRegister_01](https://polyhaven.com/a/CashRegister_01) |
| Shelf 01 | Gabriel Radić | CC0-1.0 | [Shelf_01](https://polyhaven.com/a/Shelf_01) |
| Wooden Table 03 | Gabriel Radić | CC0-1.0 | [WoodenTable_03](https://polyhaven.com/a/WoodenTable_03) |
| Antique Ceramic Vase 01 | James Ray Cock | CC0-1.0 | [antique_ceramic_vase_01](https://polyhaven.com/a/antique_ceramic_vase_01) |
| Brass Vase 02 | Rico Cilliers | CC0-1.0 | [brass_vase_02](https://polyhaven.com/a/brass_vase_02) |
| Ceramic Vase 01 | James Ray Cock | CC0-1.0 | [ceramic_vase_01](https://polyhaven.com/a/ceramic_vase_01) |
| Ceramic Vase 02 | James Ray Cock | CC0-1.0 | [ceramic_vase_02](https://polyhaven.com/a/ceramic_vase_02) |
| Ceramic Vase 04 | James Ray Cock | CC0-1.0 | [ceramic_vase_04](https://polyhaven.com/a/ceramic_vase_04) |
| Flower Empodium | Jenelle van Heerden, Rico Cilliers | CC0-1.0 | [flower_empodium](https://polyhaven.com/a/flower_empodium) |
| Gallinera Chair | Ulan Cabanilla | CC0-1.0 | [gallinera_chair](https://polyhaven.com/a/gallinera_chair) |
| Hanging Industrial Lamp | Kuutti Siitonen | CC0-1.0 | [hanging_industrial_lamp](https://polyhaven.com/a/hanging_industrial_lamp) |
| Lantern Chandelier 01 | Kirill Sannikov | CC0-1.0 | [lantern_chandelier_01](https://polyhaven.com/a/lantern_chandelier_01) |
| Modern Wooden Cabinet | Patrik Pangerl | CC0-1.0 | [modern_wooden_cabinet](https://polyhaven.com/a/modern_wooden_cabinet) |
| Periwinkle Plant | Amal Kumar | CC0-1.0 | [periwinkle_plant](https://polyhaven.com/a/periwinkle_plant) |
| Planter Box 02 | James Ray Cock | CC0-1.0 | [planter_box_02](https://polyhaven.com/a/planter_box_02) |
| Potted Plant 01 | Rico Cilliers | CC0-1.0 | [potted_plant_01](https://polyhaven.com/a/potted_plant_01) |
| Potted Plant 02 | Rico Cilliers | CC0-1.0 | [potted_plant_02](https://polyhaven.com/a/potted_plant_02) |
| Potted Plant 04 | James Ray Cock | CC0-1.0 | [potted_plant_04](https://polyhaven.com/a/potted_plant_04) |
| Round Wooden Table 02 | Ulan Cabanilla | CC0-1.0 | [round_wooden_table_02](https://polyhaven.com/a/round_wooden_table_02) |
| Shrub Sorrel 01 | Rico Cilliers | CC0-1.0 | [shrub_sorrel_01](https://polyhaven.com/a/shrub_sorrel_01) |
| Small Wooden Table 01 | Ulan Cabanilla | CC0-1.0 | [small_wooden_table_01](https://polyhaven.com/a/small_wooden_table_01) |
| Standing Chalkboard 01 | ParzivalCG | CC0-1.0 | [standing_chalkboard_01](https://polyhaven.com/a/standing_chalkboard_01) |
| Watering Can Metal 01 | Charles Nderitu | CC0-1.0 | [watering_can_metal_01](https://polyhaven.com/a/watering_can_metal_01) |
| Wicker Basket 01 | Kuutti Siitonen | CC0-1.0 | [wicker_basket_01](https://polyhaven.com/a/wicker_basket_01) |
| Wicker Basket 02 | Kuutti Siitonen | CC0-1.0 | [wicker_basket_02](https://polyhaven.com/a/wicker_basket_02) |
| Wooden Bookshelf Worn | Ulan Cabanilla | CC0-1.0 | [wooden_bookshelf_worn](https://polyhaven.com/a/wooden_bookshelf_worn) |
| Wooden Bucket 01 | James Ray Cock | CC0-1.0 | [wooden_bucket_01](https://polyhaven.com/a/wooden_bucket_01) |
| Wooden Crate 01 | James Ray Cock | CC0-1.0 | [wooden_crate_01](https://polyhaven.com/a/wooden_crate_01) |
| Wooden Display Shelves 01 | James Ray Cock | CC0-1.0 | [wooden_display_shelves_01](https://polyhaven.com/a/wooden_display_shelves_01) |

模型用 `metaverse-recon fetch` 下载、`metaverse-recon models` 按物件模型的上限导出（减面、缩贴图、原点放到底面中心），结果在 `build/models/models.json`（哈希、包围盒、三角形数）；glb 本身不进版本库，按下面的命令可以重新生成。

### 贴图来源（`build/textures.json`）

| 贴图 | 作者 | 许可 | 来源页 | 实际尺寸 |
|---|---|---|---|---|
| Dark Wood | Dario Barresi, Dimitrios Savva, Rico Cilliers | CC0-1.0 | [dark_wood](https://polyhaven.com/a/dark_wood) | 2 × 2 米 |
| Hinoki Planks | Charlotte Baglioni | CC0-1.0 | [hinoki_planks](https://polyhaven.com/a/hinoki_planks) | 1.89 × 1.89 米 |
| Oak Wood Planks | Dimitrios Savva | CC0-1.0 | [oak_wood_planks](https://polyhaven.com/a/oak_wood_planks) | 1.2 × 1.2 米 |
| Stacked Stone Wall | Dimitrios Savva | CC0-1.0 | [stacked_stone_wall](https://polyhaven.com/a/stacked_stone_wall) | 2 × 2 米 |
| Terracotta Floor Tiles | Dimitrios Savva | CC0-1.0 | [terracotta_floor_tiles](https://polyhaven.com/a/terracotta_floor_tiles) | 2.08 × 2.08 米 |
| White Stucco | Amal Kumar | CC0-1.0 | [white_stucco](https://polyhaven.com/a/white_stucco) | 1.998 × 1.998 米 |

贴图用 `metaverse-recon texfetch` 下载（颜色、法线、粗糙度各一张，1k），按内容哈希放在工作区 `assets/`。

## 事件类型

`event-types/` 下是用 `metaverse admin register-event-type` 登记的文件，格式按设计 5.4：

| 空间 | 类型 | 显示 | 谁写 |
|---|---|---|---|
| `flower-town` | `order.placed` | 图标，5 秒 | 顾客专员接单时 |
| `flower-town` | `delivery.sent` | 路线起点，4 小时内有效 | 店主专员说「开始配送」时 |
| `flower-town` | `shop.status` | 状态类标签（营业中 / 已打烊），一天自动失效 | 店主专员 |
| `chronoai-lobby` | `delivery.arrived` | 路线终点，60 秒 | 店主专员确认送达时，用前厅发给花店的组织 key 写 |

送花一单两条事件用同一个 `correlationId`，格式 `flower-town:<订单号>`；前缀必须是起点空间的编号，别的空间伪造不了起点（设计第 12 节）。

## 本地怎么看

在仓库根目录先编好 SDK 和网站（`sdk/typescript`：`npm ci && npm run build`；`web`：`npm ci && npm run build`），装好重建工具（`recon`：`uv venv .venv && uv pip install -e .`），然后在本目录：

```bash
npm run local-space   # 还没有线上空间时，按 layout.json 写出一个空的基础状态
# 取模型和贴图（需要能访问 api.polyhaven.com、dl.polyhaven.org）：
for id in $(python3 -c "import json;print(' '.join(e['props']['source']['id'] for e in json.load(open('build/authored.json'))['entities']))"); do
  ../../recon/.venv/bin/metaverse-recon fetch --library polyhaven --id $id --resolution 1k; done
../../recon/.venv/bin/metaverse-recon models --authored build/authored.json --out build/models
python3 - <<'PY'   # 导出的 glb 按完整哈希放进 assets/
import json,shutil
r=json.load(open('build/models/models.json'))
for sha,i in r['files'].items(): shutil.copyfile(f"build/models/{i['file']}", f"assets/{sha}.glb")
PY
for id in dark_wood hinoki_planks oak_wood_planks stacked_stone_wall terracotta_floor_tiles white_stucco; do
  ../../recon/.venv/bin/metaverse-recon texfetch --library polyhaven --id $id --resolution 1k --out /tmp/tex/$id; done
# 把 /tmp/tex/*/color|normal|roughness.jpg 按 sha256 复制成 assets/<哈希>.jpg（build/textures.json 里是哈希）
npm run build         # 运行 build/main.ts，生成 out/ops.ndjson
npm run check         # 确认全部操作都落在地块 shop 内
npm run shot          # 无头浏览器截图到 out/shots/（需要 Chromium，默认 /opt/pw-browsers/chromium）
npm run dev           # 本地查看器
```

线上空间建好后改用 `metaverse pull`，它会用真实状态覆盖本地空状态；模型和贴图要先经 `metaverse edit upload` 上传核对（编辑计划的 `assets` 列出哈希、格式和本地路径），再 `metaverse push --plot shop` 推成草稿、拿预览链接，人确认后 `metaverse publish`。

## 线上怎么建（空间主人或组织 admin 操作，不交给 agent key）

1. `metaverse admin create-space flower-town --name 街角花店 --owner-kind org --owner <ChronoAI 组织编号>`，保存返回的分享令牌。
2. `metaverse admin set-layout layout.json --message "划出花店地块"`。
3. 在花店空间逐个 `metaverse admin register-event-type event-types/flower-town/<文件>`；在前厅空间登记 `event-types/chronoai-lobby/delivery.arrived.json`。
4. 给建造用的 agent key 开放 `/spaces/flower-town/plots/shop/` 下的接口；给写事件的 key 开放 `POST /spaces/flower-town/sources/florist/events`；前厅发一把只开放 `POST /spaces/chronoai-lobby/sources/florist/events` 的组织 key 给花店。服务注册成目录服务并打开操作范围开关之前，这些 key 只能按服务限权，发布请由人操作。
5. 组合：`POST /api/v1/universes` 建「街角」，把 `chronoai-lobby` 和 `flower-town` 加进去，摆到前厅旁边，连接花店的 `door` 和前厅的 `counter-01`（前台，作收货台）。

## 尺寸依据

按 SDK 技能说明里的真实尺寸表：柜台高 1.05 深 0.6，门 0.9 × 2.1，墙厚 0.12 层高 2.8，花桶直径 0.28–0.34 高 0.36；主通道留 1.2 米以上。
