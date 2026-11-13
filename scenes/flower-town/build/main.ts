import { readFileSync } from 'node:fs';
import type { BuildBase, EntityBody, Kit } from '@chrono-metaverse/sdk';

/**
 * 街角花店（flower-town）第二版：真实贴图 + 模型库里的现成模型。
 *
 * - 地块 `shop` 5 × 5.5 米：店面 4.4 × 4.4 米在北侧，南侧留 0.8 米街面放花箱和黑板；
 * - 结构：地块铺一层方块作街面；店内地面是贴 Poly Haven 陶土地砖的薄板；三面灰泥实墙，南墙临街开门和橱窗；
 *   墙、地面、柜台都带法线和粗糙度贴图（CC0，署名见 build/textures.json）；
 * - 物件：20 个 Poly Haven 的 CC0 模型（build/authored.json 记录来源，build/models/models.json 是
 *   `metaverse-recon models` 按上限导出的结果），加上参数形状的花团、灯箱和柜台；
 * - 锚点：`counter` 柜台（送花起点）、`door` 门口（组合里和前厅相连）、`window` 橱窗。
 *
 * 外部模型的 glb 原点在底面中心；记录里只写偏航，位置由包围盒决定（网站把模型底面中心对齐包围盒底面中心），
 * 所以包围盒 = 局部包围盒按偏航旋转后取轴对齐盒，再平移到摆放位置。
 */

interface ModelRecord {
  readonly assetHash: string;
  readonly bounds: { readonly min: [number, number, number]; readonly max: [number, number, number] };
}
interface TextureRecord {
  readonly sizeM: [number, number];
  readonly source: Record<string, string>;
  readonly maps: Record<'color' | 'normal' | 'roughness', { readonly hash: string }>;
}

const MODELS: Record<string, ModelRecord> = JSON.parse(
  readFileSync(new URL('./models/models.json', import.meta.url), 'utf8'),
).entities;
const AUTHORED: { entities: { entityId: string; props: { source: Record<string, string> } }[] } = JSON.parse(
  readFileSync(new URL('./authored.json', import.meta.url), 'utf8'),
);
const TEXTURES: Record<string, TextureRecord> = JSON.parse(
  readFileSync(new URL('./textures.json', import.meta.url), 'utf8'),
);
const SOURCE = Object.fromEntries(AUTHORED.entities.map((e) => [e.entityId, e.props.source]));

/** 材质库贴图：按实际尺寸平铺，固有色受光，带法线和粗糙度。 */
function tex(id: string, uv: 'box' | 'planar' | 'mesh', rotate = 0) {
  const t = TEXTURES[id];
  if (t === undefined) throw new Error(`build/textures.json 里没有贴图 ${id}`);
  return {
    texture: { hash: t.maps.color.hash, uv },
    tile: t.sizeM,
    ...(rotate !== 0 ? { rotate } : {}),
    shading: 'albedo' as const,
    normalMap: t.maps.normal.hash,
    roughnessMap: t.maps.roughness.hash,
  };
}

export default function build(base: BuildBase, kit: Kit) {
  const { addBlock, fill, cells, toGrid, place, placeEntity, template, instance } = kit;
  const { box, cylinder, cone, lathe, group, anchor, createAnchor } = kit;

  const [ox, oy, oz] = base.target.origin ?? [0, 0, 0];
  const street = oy + 0.05; // 方块街面的顶
  const F = street + 0.02; // 店内地砖面
  const at = (x: number, y: number, z: number): [number, number, number] => [ox + x, y, oz + z];
  const H = 2.8; // 层高
  const T = 0.12; // 墙厚
  // 店面外轮廓（相对地块）：x 0.3–4.7，z 0.3–4.7；街面在 z 4.7–5.5
  const X0 = 0.3, X1 = 4.7, Z0 = 0.3, Z1 = 4.7;

  // ---- 贴图墙：几块面板，每块一个贴图盒子；门洞和橱窗洞留空，窗洞放玻璃 ----
  const stucco = tex('white_stucco', 'box');
  const panel = (id: string, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) =>
    box([x1 - x0, y1 - y0, z1 - z0], { at: at((x0 + x1) / 2, y0, (z0 + z1) / 2), ...stucco });
  const walls = group([
    panel('n', X0, X1, Z0, Z0 + T, F, F + H), // 北墙
    panel('w', X0, X0 + T, Z0 + T, Z1, F, F + H), // 西墙
    panel('e', X1 - T, X1, Z0 + T, Z1, F, F + H), // 东墙
    // 南墙：x 从 0.3 起；门洞 x 0.8–1.7（高 2.1），橱窗 x 2.3–4.5（台高 0.5，高 1.8）
    panel('s1', X0, 0.8, Z1 - T, Z1, F, F + H),
    panel('s-door-top', 0.8, 1.7, Z1 - T, Z1, F + 2.1, F + H),
    panel('s2', 1.7, 2.3, Z1 - T, Z1, F, F + H),
    panel('s-win-sill', 2.3, 4.5, Z1 - T, Z1, F, F + 0.5),
    panel('s-win-top', 2.3, 4.5, Z1 - T, Z1, F + 2.3, F + H),
    panel('s3', 4.5, X1, Z1 - T, Z1, F, F + H),
  ]);
  const glass = box([2.2, 1.8, 0.012], { at: at(3.4, F + 0.5, Z1 - T / 2), color: '#cfe3ee', opacity: 0.3 });

  // ---- 柜台：橡木柜体 + 浅色台面 + 深色踢脚，正面朝门（+z），长 1.6、深 0.6、高 1.05 ----
  const CX = 2.5, CZ = 1.6, CL = 1.6, CD = 0.6, CH = 1.05;
  const counter = group([
    box([CL - 0.1, 0.1, CD - 0.05], { at: [0, 0, -0.025], color: '#2f2a26' }),
    box([CL, CH - 0.14, CD], { at: [0, 0.1, 0], ...tex('oak_wood_planks', 'box') }),
    box([CL + 0.06, 0.04, CD + 0.06], { at: [0, CH - 0.04, 0], chamfer: 0.008, color: '#efe9df', roughness: 0.6 }),
  ], { at: at(CX, F, CZ) });

  // ---- 花团：几颗不同色的小球加绿叶，放在花桶、花瓶和花篮上 ----
  const bloom = (colors: string[], r = 0.055) =>
    group([
      cone(0.16, 0.14, { color: '#4f8f55' }),
      ...colors.map((c, i) => {
        const a = (i / colors.length) * Math.PI * 2;
        const rad = i === 0 ? 0 : 0.085;
        return lathe(
          [[0, 0], [r * 0.7, r * 0.3], [r, r], [r * 0.7, r * 1.7], [0, r * 2]],
          { at: [Math.cos(a) * rad, i === 0 ? 0.12 : 0.08, Math.sin(a) * rad], color: c },
        );
      }),
    ]);
  const bloomPink = template('bloom-pink', bloom(['#f28bb1', '#e25878', '#f6b1c8', '#e25878', '#f28bb1', '#fbe3ec']), { label: '花团（粉）' });
  const bloomWarm = template('bloom-warm', bloom(['#f2c14e', '#e8743b', '#f9d976', '#e8743b', '#f2c14e', '#fff1c1']), { label: '花团（暖）' });
  const bloomWhite = template('bloom-white', bloom(['#ffffff', '#f3efe6', '#ffffff', '#e9e4d8', '#ffffff', '#f3efe6'], 0.05), { label: '花团（白）' });
  const templates = new Map([
    ['bloom-pink', bloomPink.shape!],
    ['bloom-warm', bloomWarm.shape!],
    ['bloom-white', bloomWhite.shape!],
  ]);

  // ---- 外部模型：按偏航旋转包围盒，原点在底面中心 ----
  function model(
    entityId: string,
    key: string,
    position: [number, number, number],
    options: { yaw?: number; label?: string; anchorId?: string; props?: Record<string, unknown> } = {},
  ) {
    const rec = MODELS[key];
    if (rec === undefined) throw new Error(`build/models/models.json 里没有 ${key}`);
    const yaw = options.yaw ?? 0;
    const th = (yaw * Math.PI) / 180;
    const { min, max } = rec.bounds;
    const corners = [[min[0], min[2]], [max[0], min[2]], [min[0], max[2]], [max[0], max[2]]].map(([x, z]) => [
      x * Math.cos(th) + z * Math.sin(th),
      -x * Math.sin(th) + z * Math.cos(th),
    ]);
    const xs = corners.map((c) => c[0]!);
    const zs = corners.map((c) => c[1]!);
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    const body: EntityBody = {
      entityId,
      layer: 'ext',
      kind: 'object',
      label: options.label ?? SOURCE[key]?.title ?? key,
      ...(options.anchorId !== undefined ? { anchorId: options.anchorId } : {}),
      assetHash: rec.assetHash,
      material: { shading: 'albedo' },
      ...(yaw !== 0 ? { transform: { yaw } } : {}),
      bounds: {
        min: [r(position[0] + Math.min(...xs)), r(position[1] + min[1]), r(position[2] + Math.min(...zs))],
        max: [r(position[0] + Math.max(...xs)), r(position[1] + max[1]), r(position[2] + Math.max(...zs))],
      },
      props: { ...(options.props ?? {}), source: SOURCE[key] },
    } as EntityBody;
    return placeEntity(body);
  }

  const ops = [
    // ---- 街面：整块地块铺 5 厘米浅灰方块 ----
    addBlock('pavement', 'solid', { color: '#b9b4ab' }),
    fill(cells([toGrid(ox), toGrid(oy), toGrid(oz)], [100, 1, 110]), 'pavement'),
    // ---- 店内地砖：陶土地砖薄板，按 2.08 米平铺 ----
    place('floor', box([X1 - X0, 0.02, Z1 - Z0], { at: at((X0 + X1) / 2, street, (Z0 + Z1) / 2), ...tex('terracotta_floor_tiles', 'planar') }), {
      kind: 'structure',
      label: '店内地砖',
    }),
    place('walls', walls, { kind: 'structure', label: '墙' }),
    place('window-glass', glass, { kind: 'structure', label: '橱窗玻璃' }),
    place('counter', counter, { label: '柜台', anchorId: 'counter', props: { 说明: '送花从这里出发' } }),

    placeEntity(bloomPink),
    placeEntity(bloomWarm),
    placeEntity(bloomWhite),

    // ---- 柜台上：收银机、青花瓶插花、发布会花篮样品 ----
    model('cash-register', 'lib-cashregister_01', at(3.05, F + CH, CZ), { label: '收银机', yaw: 180 }),
    model('vase-counter', 'lib-antique_ceramic_vase_01', at(1.95, F + CH, CZ - 0.05), { label: '青花瓶' }),
    place('bloom-counter', instance('bloom-pink', { at: at(1.95, F + CH + 0.4, CZ - 0.05) }), { templates, label: '花束' }),
    model('basket-sample', 'lib-wicker_basket_02', at(2.5, F + CH, CZ - 0.08), { label: '发布会花篮样品', yaw: 20 }),
    place('bloom-basket', instance('bloom-warm', { at: at(2.5, F + CH + 0.18, CZ - 0.08) }), { templates, label: '花篮里的花' }),

    // ---- 北墙、柜台后一排六个木桶，每桶一团花 ----
    ...[0.95, 1.45, 1.95, 2.45, 2.95, 3.45].map((x, i) => [
      model(`bucket-${String(i + 1).padStart(2, '0')}`, 'lib-wooden_bucket_01', at(x, F, 0.72), { label: '花桶', yaw: i * 50 }),
      place(`bloom-bucket-${String(i + 1).padStart(2, '0')}`, instance(['bloom-pink', 'bloom-warm', 'bloom-white'][i % 3]!, { at: at(x, F + 0.5, 0.72), yaw: i * 70 }), { templates, label: '桶里的花' }),
    ]),

    // ---- 东墙：木格展示架，上面放两盆多肉和一只瓷瓶 ----
    model('display-shelves', 'lib-wooden_display_shelves_01', at(4.37, F, 2.5), { label: '展示架', yaw: 180 }),
    model('succulent-01', 'lib-potted_plant_04', at(4.37, F + 1.556, 2.15), { label: '多肉' }),
    model('succulent-02', 'lib-potted_plant_04', at(4.37, F + 1.556, 2.85), { label: '多肉', yaw: 40 }),
    model('vase-shelf', 'lib-ceramic_vase_02', at(4.37, F + 1.556, 2.5), { label: '瓷瓶' }),
    place('bloom-shelf', instance('bloom-white', { at: at(4.37, F + 1.556 + 0.28, 2.5) }), { templates, label: '花束' }),

    // ---- 橱窗里：圆桌展台，桌上瓷瓶插花、黄铜瓶和一小丛酢浆草 ----
    model('display-table', 'lib-round_wooden_table_02', at(3.4, F, 3.95), { label: '橱窗展台' }),
    model('vase-table-01', 'lib-ceramic_vase_01', at(3.25, F + 0.746, 3.85), { label: '瓷瓶' }),
    place('bloom-table', instance('bloom-pink', { at: at(3.25, F + 0.746 + 0.38, 3.85) }), { templates, label: '花束' }),
    model('vase-table-02', 'lib-brass_vase_02', at(3.6, F + 0.746, 4.05), { label: '黄铜瓶', yaw: 30 }),
    model('sorrel', 'lib-shrub_sorrel_01', at(3.55, F + 0.746, 3.75), { label: '酢浆草' }),
    model('vase-table-03', 'lib-ceramic_vase_04', at(3.15, F + 0.746, 4.15), { label: '瓷瓶' }),

    // ---- 店内角落：门边一棵高盆栽，橱窗右侧一盆阔叶 ----
    model('plant-tall', 'lib-potted_plant_01', at(0.85, F, 3.85), { label: '盆栽', yaw: 20 }),
    model('plant-leafy', 'lib-potted_plant_02', at(4.15, F, 3.95), { label: '盆栽' }),

    // ---- 吊灯两盏（模型原点在挂钩，从天花垂下）----
    model('lamp-01', 'lib-hanging_industrial_lamp', at(1.6, F + H, 2.6), { label: '吊灯' }),
    model('lamp-02', 'lib-hanging_industrial_lamp', at(3.4, F + H, 2.6), { label: '吊灯' }),

    // ---- 街面：橱窗下的花箱（长春花）、门边的花箱（小黄花）和黑板 ----
    model('planter-window', 'lib-planter_box_02', at(3.4, street, 5.0), { label: '花箱' }),
    model('planter-window-flowers', 'lib-periwinkle_plant', at(3.4, street + 0.3, 5.0), { label: '长春花' }),
    model('planter-door', 'lib-planter_box_02', at(0.95, street, 5.0), { label: '花箱', yaw: 180 }),
    model('planter-door-flowers', 'lib-flower_empodium', at(0.95, street + 0.3, 5.0), { label: '小黄花', yaw: 180 }),
    model('chalkboard', 'lib-standing_chalkboard_01', at(2.05, street, 5.05), { label: '黑板', yaw: 0 }),

    // ---- 门上方的营业灯箱 ----
    place('sign-open', box([0.7, 0.22, 0.04], { at: at(1.25, F + 2.3, Z1 + 0.03), color: '#f6d365', unlit: true }), { label: '营业中' }),

    // ---- 锚点 ----
    createAnchor(anchor('counter', 'counter', {
      box: [toGrid(ox + CX - CL / 2), toGrid(F), toGrid(oz + CZ - CD / 2), toGrid(ox + CX + CL / 2), toGrid(F + CH), toGrid(oz + CZ + CD / 2)],
    }, { label: '柜台' })),
    createAnchor(anchor('door', 'door', { position: at(1.25, F, Z1 - T / 2) }, { label: '花店门口' })),
    createAnchor(anchor('window', 'zone', {
      box: [toGrid(ox + 2.3), toGrid(F), toGrid(oz + 3.6), toGrid(ox + 4.5), toGrid(F + 2.3), toGrid(oz + Z1)],
    }, { label: '橱窗' })),
  ];
  return { message: '街角花店：贴图、模型库物件与橱窗陈列', ops };
}
