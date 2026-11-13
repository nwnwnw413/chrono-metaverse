import { readFileSync } from 'node:fs';
import type { BuildBase, EntityBody, Kit, Shape } from '@chrono-metaverse/sdk';

/**
 * 街角花店（flower-town）第四版：6 × 5 米的小店，参考「百花深」的风格和布局，只留两个分区。
 *
 *   x 向东，z 向南，北墙在 z = 0；出入口在南墙偏左（x 2.2–3.4）；南侧再留 2 米街面做门廊。
 *   收银区      东北角：橡木收银台正面朝门，背后是叠石墙、背柜和招牌；去前厅的花从这里出发
 *   零售 + 花艺 其余部分：西墙木格架、书架、花艺工作台和花桶，中央陈列岛，东墙层架，头顶花环
 *   吊顶 3.0 米桧木板带木梁和筒灯；橡木地板；白灰泥墙，四面有窗，南墙右侧是橱窗。
 *
 * 外部模型全部来自 Poly Haven（CC0），由 metaverse-recon 导出，署名在 props.source；
 * 贴图来自 Poly Haven（CC0），按实际尺寸平铺、固有色受光。
 * 锚点：counter（收银台，送花起点）、door（出入口）、window（橱窗）、retail、floral。
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
const MODELS: Record<string, ModelRecord> = JSON.parse(readFileSync(new URL('./models/models.json', import.meta.url), 'utf8')).entities;
const AUTHORED: { entities: { entityId: string; props: { source: Record<string, string> } }[] } = JSON.parse(readFileSync(new URL('./authored.json', import.meta.url), 'utf8'));
const TEXTURES: Record<string, TextureRecord> = JSON.parse(readFileSync(new URL('./textures.json', import.meta.url), 'utf8'));
const SOURCE = Object.fromEntries(AUTHORED.entities.map((e) => [e.entityId, e.props.source]));

type V3 = [number, number, number];

export default function build(base: BuildBase, kit: Kit) {
  const { addBlock, fill, cells, toGrid, place, placeEntity, template, instance } = kit;
  const { box, cylinder, cone, lathe, sweep, group, anchor, createAnchor } = kit;

  const [ox, oy, oz] = base.target.origin ?? [0, 0, 0];
  const street = oy + 0.05; // 方块街面的顶
  const F = street + 0.02; // 室内地面
  const H = 3.0; // 吊顶高
  const T = 0.2; // 外墙厚
  const t = 0.12; // 隔墙厚
  const W = 6.4, D = 5.4; // 建筑外轮廓（米）：x 0.2–6.2、z 0.2–5.2 是墙外皮，这里的 W、D 含两侧 0.2 米街沿
  const at = (x: number, y: number, z: number): V3 => [ox + x, y, oz + z];
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

  // ---------------------------------------------------------------- 贴图
  function tex(id: string, uv: 'box' | 'planar' | 'mesh', rotate = 0) {
    const x = TEXTURES[id];
    if (x === undefined) throw new Error(`build/textures.json 里没有贴图 ${id}`);
    return {
      texture: { hash: x.maps.color.hash, uv },
      tile: x.sizeM,
      ...(rotate !== 0 ? { rotate } : {}),
      shading: 'albedo' as const,
      normalMap: x.maps.normal.hash,
      roughnessMap: x.maps.roughness.hash,
    };
  }
  const stucco = tex('white_stucco', 'box');
  const oak = tex('oak_wood_planks', 'planar');
  const hinoki = tex('hinoki_planks', 'planar', 90);
  const darkwood = tex('dark_wood', 'box');
  const stackedStone = tex('stacked_stone_wall', 'box');
  const terracotta = tex('terracotta_floor_tiles', 'planar');

  // 轴对齐的贴图盒子：给出 x、y、z 范围
  const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: Record<string, unknown>) =>
    box([x1 - x0, y1 - y0, z1 - z0], { at: at((x0 + x1) / 2, y0, (z0 + z1) / 2), ...mat });

  // ---------------------------------------------------------------- 带洞口的贴图墙
  interface Opening { from: number; to: number; sill?: number; height?: number; glass?: boolean }
  /** 平行于 x 轴的墙：z 范围 [z0, z1]，沿 x 从 x0 到 x1，洞口按 x 坐标。 */
  function wallX(x0: number, x1: number, z0: number, z1: number, openings: Opening[], mat = stucco): Shape[] {
    const parts: Shape[] = [];
    let cursor = x0;
    for (const o of [...openings].sort((a, b) => a.from - b.from)) {
      const sill = o.sill ?? 0, height = o.height ?? H - sill;
      if (o.from > cursor) parts.push(slab(cursor, o.from, F, F + H, z0, z1, mat));
      if (sill > 0) parts.push(slab(o.from, o.to, F, F + sill, z0, z1, mat));
      if (sill + height < H) parts.push(slab(o.from, o.to, F + sill + height, F + H, z0, z1, mat));
      if (o.glass !== false) parts.push(slab(o.from, o.to, F + sill, F + sill + height, (z0 + z1) / 2 - 0.006, (z0 + z1) / 2 + 0.006, { color: '#d6e6ee', opacity: 0.28 }));
      cursor = o.to;
    }
    if (cursor < x1) parts.push(slab(cursor, x1, F, F + H, z0, z1, mat));
    return parts;
  }
  /** 平行于 z 轴的墙：x 范围 [x0, x1]，沿 z 从 z0 到 z1，洞口按 z 坐标。 */
  function wallZ(z0: number, z1: number, x0: number, x1: number, openings: Opening[], mat = stucco): Shape[] {
    const parts: Shape[] = [];
    let cursor = z0;
    for (const o of [...openings].sort((a, b) => a.from - b.from)) {
      const sill = o.sill ?? 0, height = o.height ?? H - sill;
      if (o.from > cursor) parts.push(slab(x0, x1, F, F + H, cursor, o.from, mat));
      if (sill > 0) parts.push(slab(x0, x1, F, F + sill, o.from, o.to, mat));
      if (sill + height < H) parts.push(slab(x0, x1, F + sill + height, F + H, o.from, o.to, mat));
      if (o.glass !== false) parts.push(slab((x0 + x1) / 2 - 0.006, (x0 + x1) / 2 + 0.006, F + sill, F + sill + height, o.from, o.to, { color: '#d6e6ee', opacity: 0.28 }));
      cursor = o.to;
    }
    if (cursor < z1) parts.push(slab(x0, x1, F, F + H, cursor, z1, mat));
    return parts;
  }

  // ---------------------------------------------------------------- 外部模型
  function model(entityId: string, key: string, position: V3, options: { yaw?: number; label?: string; anchorId?: string; props?: Record<string, unknown> } = {}) {
    const rec = MODELS[key];
    if (rec === undefined) throw new Error(`build/models/models.json 里没有 ${key}`);
    const yaw = options.yaw ?? 0;
    const th = (yaw * Math.PI) / 180;
    const { min, max } = rec.bounds;
    const corners = [[min[0], min[2]], [max[0], min[2]], [min[0], max[2]], [max[0], max[2]]].map(([x, z]) => [x! * Math.cos(th) + z! * Math.sin(th), -x! * Math.sin(th) + z! * Math.cos(th)]);
    const xs = corners.map((c) => c[0]!), zs = corners.map((c) => c[1]!);
    const body = {
      entityId,
      layer: 'ext',
      kind: 'object',
      label: options.label ?? SOURCE[key]?.title ?? key,
      ...(options.anchorId !== undefined ? { anchorId: options.anchorId } : {}),
      assetHash: rec.assetHash,
      material: { shading: 'albedo' },
      ...(yaw !== 0 ? { transform: { yaw } } : {}),
      bounds: {
        min: [r6(position[0] + Math.min(...xs)), r6(position[1] + min[1]), r6(position[2] + Math.min(...zs))],
        max: [r6(position[0] + Math.max(...xs)), r6(position[1] + max[1]), r6(position[2] + Math.max(...zs))],
      },
      props: { ...(options.props ?? {}), source: SOURCE[key] },
    } as unknown as EntityBody;
    return placeEntity(body);
  }

  // ---------------------------------------------------------------- 模板：花团、筒灯
  const bloom = (colors: string[], r = 0.055) =>
    group([
      cone(0.16, 0.14, { color: '#4f8f55' }),
      ...colors.map((c, i) => {
        const a = (i / colors.length) * Math.PI * 2, rad = i === 0 ? 0 : 0.085;
        return lathe([[0, 0], [r * 0.7, r * 0.3], [r, r], [r * 0.7, r * 1.7], [0, r * 2]], { at: [Math.cos(a) * rad, i === 0 ? 0.12 : 0.08, Math.sin(a) * rad], color: c });
      }),
    ]);
  const tBloomPink = template('bloom-pink', bloom(['#f28bb1', '#e25878', '#f6b1c8', '#e25878', '#f28bb1', '#fbe3ec']), { label: '花团（粉）' });
  const tBloomWarm = template('bloom-warm', bloom(['#f2c14e', '#e8743b', '#f9d976', '#e8743b', '#f2c14e', '#fff1c1']), { label: '花团（暖）' });
  const tBloomWhite = template('bloom-white', bloom(['#ffffff', '#f3efe6', '#ffffff', '#e9e4d8', '#ffffff', '#f3efe6'], 0.05), { label: '花团（白）' });
  const tBloomLilac = template('bloom-lilac', bloom(['#b9a6e0', '#8f7bc9', '#d7cbf0', '#8f7bc9', '#b9a6e0', '#efe9fb']), { label: '花团（紫）' });
  /** 透明花桶插一束玫瑰：桶（半透明）、花茎、一簇花头 */
  const roseBunch = (colors: string[]) =>
    group([
      cylinder(0.1, 0.32, { radiusTop: 0.12, color: '#dfe8ec', opacity: 0.35 }),
      cylinder(0.045, 0.3, { at: [0, 0.3, 0], color: '#4f8f55' }),
      ...colors.map((c, i) => {
        const a = (i / colors.length) * Math.PI * 2, rad = i === 0 ? 0 : 0.075;
        return lathe([[0, 0], [0.04, 0.012], [0.055, 0.055], [0.04, 0.1], [0, 0.11]], { at: [Math.cos(a) * rad, i === 0 ? 0.62 : 0.57, Math.sin(a) * rad], color: c });
      }),
    ]);
  const tRosePink = template('rose-pink', roseBunch(['#f4a3bd', '#ec7fa3', '#f8c2d3', '#ec7fa3', '#f4a3bd', '#fbd9e4', '#ec7fa3']), { label: '粉玫瑰一桶' });
  const tRoseWhite = template('rose-white', roseBunch(['#ffffff', '#f5f0e6', '#ffffff', '#ede7da', '#ffffff', '#f5f0e6', '#ffffff']), { label: '白玫瑰一桶' });
  /** 白盆绣球：白陶盆 + 大花球 */
  const hydrangea = (c: string) => group([
    cylinder(0.09, 0.14, { radiusTop: 0.11, color: '#f4f1ea' }),
    cone(0.13, 0.1, { at: [0, 0.13, 0], color: '#4f8f55' }),
    ...[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return lathe([[0, 0], [0.06, 0.02], [0.08, 0.08], [0.06, 0.14], [0, 0.16]], { at: [Math.cos(a) * 0.07, 0.2, Math.sin(a) * 0.07], color: c }); }),
    lathe([[0, 0], [0.06, 0.02], [0.08, 0.08], [0.06, 0.14], [0, 0.16]], { at: [0, 0.26, 0], color: c }),
  ]);
  const tHydrangeaBlue = template('hydrangea-blue', hydrangea('#8fb3e6'), { label: '蓝绣球' });
  const tHydrangeaPink = template('hydrangea-pink', hydrangea('#f0a6c4'), { label: '粉绣球' });
  const tHydrangeaLilac = template('hydrangea-lilac', hydrangea('#b9a6e0'), { label: '紫绣球' });
  const tDownlight = template('downlight', group([cylinder(0.08, 0.012, { color: '#ffe9c4', unlit: true }), cylinder(0.1, 0.006, { at: [0, 0.012, 0], color: '#eeeeee' })]), { label: '筒灯' });
  const templates = new Map<string, Shape>([
    ['bloom-pink', tBloomPink.shape!], ['bloom-warm', tBloomWarm.shape!], ['bloom-white', tBloomWhite.shape!], ['bloom-lilac', tBloomLilac.shape!], ['downlight', tDownlight.shape!],
    ['rose-pink', tRosePink.shape!], ['rose-white', tRoseWhite.shape!], ['hydrangea-blue', tHydrangeaBlue.shape!], ['hydrangea-pink', tHydrangeaPink.shape!], ['hydrangea-lilac', tHydrangeaLilac.shape!],
  ]);
  const BLOOMS = ['bloom-pink', 'bloom-warm', 'bloom-white', 'bloom-lilac'];
  let bloomN = 0;
  const bloomAt = (x: number, y: number, z: number, which?: string, yaw = 0) =>
    place(`bloom-${String(++bloomN).padStart(3, '0')}`, instance(which ?? BLOOMS[bloomN % BLOOMS.length]!, { at: at(x, y, z), ...(yaw ? { yaw } : {}) }), { templates, label: '花' });
  /** 花瓶 + 花团 */
  const vase = (id: string, key: string, x: number, y: number, z: number, which?: string) => {
    const h = MODELS[key]!.bounds.max[1];
    return [model(id, key, at(x, y, z)), bloomAt(x, y + h - 0.02, z, which, (id.length * 37) % 360)];
  };
  /** 头顶花环：绿色环 + 一圈花球 */
  const wreath = (id: string, x: number, y: number, z: number, radius = 0.55) => {
    const n = 24;
    const path: V3[] = Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * radius, 0, Math.sin(a) * radius] as V3; });
    const balls: Shape[] = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2;
      return lathe([[0, 0], [0.05, 0.02], [0.07, 0.07], [0.05, 0.12], [0, 0.14]], { at: [Math.cos(a) * radius, -0.02, Math.sin(a) * radius], color: ['#f28bb1', '#ffffff', '#f2c14e', '#b9a6e0', '#e25878'][i % 5]! });
    });
    const wire = sweep([[0, 0, 0], [0, 1.0, 0]], { circle: 0.004 }, { at: [0, 0.07, 0], color: '#444444' });
    return place(id, group([sweep(path, { circle: 0.045 }, { color: '#4f8f55' }), ...balls, wire], { at: at(x, y, z) }), { label: '花环' });
  };


  // ---------------------------------------------------------------- 建筑轮廓（米，相对地块）
  const X0 = 0.2, X1 = 6.2, Z0 = 0.2, Z1 = 5.2; // 墙外皮
  const IX0 = X0 + T, IX1 = X1 - T, IZ0 = Z0 + T, IZ1 = Z1 - T; // 墙内皮
  const ops: unknown[] = [];
  const push = (...items: unknown[]) => { for (const i of items) if (i !== undefined) ops.push(i); };

  // ---------------------------------------------------------------- 街面与地面
  push(addBlock('pavement', 'solid', { color: '#c9c3b8' }), fill(cells([toGrid(ox), toGrid(oy), toGrid(oz)], [128, 1, 148]), 'pavement'));
  push(place('floor', slab(IX0, IX1, street, F, IZ0, IZ1, oak), { kind: 'structure', label: '橡木地板' }));
  push(place('floor-porch', slab(X0, X1, street, F, Z1, 7.2, terracotta), { kind: 'structure', label: '门廊地砖' }));

  // ---------------------------------------------------------------- 外墙（带窗）、叠石背景墙、门
  push(place('wall-north', group(wallX(X0, X1, Z0, Z0 + T, [{ from: 0.8, to: 2.6, sill: 1.2, height: 1.2 }])), { kind: 'structure', label: '北墙' }));
  push(place('wall-south', group(wallX(X0, X1, Z1 - T, Z1, [
    { from: 0.8, to: 1.8, sill: 0.9, height: 1.5 }, { from: 2.2, to: 3.4, sill: 0, height: 2.3, glass: false }, { from: 3.8, to: 5.6, sill: 0.5, height: 1.9 },
  ])), { kind: 'structure', label: '南墙：门和橱窗' }));
  push(place('wall-west', group(wallZ(Z0 + T, Z1 - T, X0, X0 + T, [{ from: 1.2, to: 3.6, sill: 0.9, height: 1.6 }])), { kind: 'structure', label: '西墙' }));
  push(place('wall-east', group(wallZ(Z0 + T, Z1 - T, X1 - T, X1, [{ from: 1.4, to: 3.2, sill: 1.4, height: 1.1 }])), { kind: 'structure', label: '东墙' }));
  push(place('stone-wall', slab(3.2, IX1, F, F + H, IZ0, IZ0 + 0.03, stackedStone), { kind: 'structure', label: '收银区叠石墙' }));
  const leaf = (id: string, x: number, yaw: number) => place(id, group([
    box([0.58, 2.25, 0.04], { at: [0, 0, 0], ...darkwood }), box([0.42, 1.8, 0.02], { at: [0, 0.3, 0], color: '#d6e6ee', opacity: 0.3 }),
  ], { at: at(x, F, Z1 - T / 2), yaw }), { label: '门' });
  push(leaf('door-left', 2.5, 35), leaf('door-right', 3.1, -35));

  // ---------------------------------------------------------------- 吊顶、梁、筒灯
  push(place('ceiling', slab(IX0, IX1, F + H, F + H + 0.05, IZ0, IZ1, hinoki), { kind: 'structure', label: '桧木吊顶' }));
  push(place('beams', group([slab(IX0, IX1, F + H - 0.22, F + H, 2.5, 2.68, darkwood), slab(3.1, 3.28, F + H - 0.22, F + H, IZ0, IZ1, darkwood)]), { kind: 'structure', label: '木梁' }));
  push(placeEntity(tDownlight));
  let dl = 0;
  for (const x of [1.4, 3.2, 5.0]) for (const z of [1.4, 3.8]) push(place(`downlight-${String(++dl).padStart(2, '0')}`, instance('downlight', { at: at(x, F + H - 0.012, z) }), { templates, label: '筒灯' }));
  push(placeEntity(tBloomPink), placeEntity(tBloomWarm), placeEntity(tBloomWhite), placeEntity(tBloomLilac));
  push(placeEntity(tRosePink), placeEntity(tRoseWhite), placeEntity(tHydrangeaBlue), placeEntity(tHydrangeaPink), placeEntity(tHydrangeaLilac));

  // ================================================================ 收银区（东北角）
  const cX0 = 3.6, cX1 = 5.6, cZ = 1.55;
  push(place('cashier-counter', group([
    slab(cX0, cX1, F + 0.1, F + 1.02, cZ - 0.3, cZ + 0.3, oak), slab(cX0 - 0.03, cX1 + 0.03, F + 1.02, F + 1.06, cZ - 0.33, cZ + 0.33, { color: '#efe9df', roughness: 0.6 }),
    slab(cX0 + 0.05, cX1 - 0.05, F, F + 0.1, cZ - 0.25, cZ + 0.25, { color: '#2f2a26' }),
  ]), { label: '收银台', anchorId: 'counter', props: { 说明: '送花从这里出发' } }));
  push(model('cashier-register', 'lib-cashregister_01', at(5.2, F + 1.06, cZ), { yaw: 180 }));
  push(...vase('cashier-vase', 'lib-antique_ceramic_vase_01', 3.9, F + 1.06, cZ - 0.05, 'bloom-pink'));
  push(model('cashier-basket', 'lib-wicker_basket_02', at(4.55, F + 1.06, cZ - 0.06), { yaw: 15, label: '发布会花篮样品' }), bloomAt(4.55, F + 1.24, cZ - 0.06, 'bloom-warm'));
  push(model('cashier-cabinet', 'lib-modern_wooden_cabinet', at(4.6, F, IZ0 + 0.03 + 0.27)));
  push(...vase('cashier-v2', 'lib-ceramic_vase_02', 3.8, F + 0.68, 0.7, 'bloom-white'), ...vase('cashier-v3', 'lib-brass_vase_02', 5.4, F + 0.68, 0.7, 'bloom-lilac'), model('cashier-succ', 'lib-potted_plant_04', at(4.6, F + 0.68, 0.7)));
  push(place('cashier-sign', group([box([2.0, 0.44, 0.08], { at: [0, 0, 0], ...darkwood }), box([1.8, 0.05, 0.02], { at: [0, -0.07, 0.04], color: '#ffd98a', unlit: true })], { at: at(4.6, F + 2.0, IZ0 + 0.03 + 0.05) }), { label: '招牌' }));
  push(bloomAt(3.65, F + 2.42, 0.55, 'bloom-pink'), bloomAt(4.6, F + 2.42, 0.55, 'bloom-white'), bloomAt(5.55, F + 2.42, 0.55, 'bloom-warm'));
  push(place('cashier-logo', group([cylinder(0.3, 0.03, { pitch: 90, color: '#e8d9b8', roughness: 0.7 }), cylinder(0.23, 0.01, { at: [0, 0, 0.035], pitch: 90, color: '#fff2cc', unlit: true })], { at: at(5.6, F + 2.55, IZ0 + 0.03 + 0.02) }), { label: '标志' }));

  // ================================================================ 零售 + 花艺
  // 西墙：木格展示架（朝东）、书架（靠北墙朝南）
  push(model('grid-shelf', 'lib-wooden_display_shelves_01', at(IX0 + 0.19, F, 1.3), { label: '木格展示架' }));
  push(model('grid-succ', 'lib-potted_plant_04', at(IX0 + 0.19, F + 1.556, 1.0)), ...vase('grid-vase', 'lib-ceramic_vase_04', IX0 + 0.19, F + 1.556, 1.5, 'bloom-lilac'));
  push(model('bookshelf', 'lib-wooden_bookshelf_worn', at(1.6, F, IZ0 + 0.3)));
  push(...vase('book-vase', 'lib-ceramic_vase_01', 1.3, F + 2.06, 0.7, 'bloom-pink'), model('book-basket', 'lib-wicker_basket_01', at(2.0, F + 2.06, 0.7)));
  // 花艺工作台靠西墙（长边沿 z），台上洒水壶、花瓶、花篮；藤椅朝西
  push(model('floral-bench', 'lib-woodentable_03', at(1.1, F, 3.6), { yaw: 90, label: '花艺工作台' }));
  push(model('floral-can', 'lib-watering_can_metal_01', at(1.1, F + 0.83, 3.05), { yaw: 60 }), ...vase('floral-v1', 'lib-ceramic_vase_02', 1.1, F + 0.83, 3.5, 'bloom-warm'), model('floral-basket', 'lib-wicker_basket_01', at(1.1, F + 0.83, 4.0)), bloomAt(1.1, F + 0.95, 4.0, 'bloom-white'));
  push(model('floral-chair', 'lib-gallinera_chair', at(1.85, F, 3.6), { yaw: -90 }));
  // 花桶：西墙中段两个，西南窗下两个
  push(model('bucket-1', 'lib-wooden_bucket_01', at(0.65, F, 2.15)), bloomAt(0.65, F + 0.5, 2.15, 'bloom-pink'), model('bucket-2', 'lib-wooden_bucket_01', at(0.65, F, 2.55), { yaw: 50 }), bloomAt(0.65, F + 0.5, 2.55, 'bloom-lilac'));
  push(model('bucket-3', 'lib-wooden_bucket_01', at(0.7, F, 4.6), { yaw: 100 }), bloomAt(0.7, F + 0.5, 4.6, 'bloom-warm'), model('bucket-4', 'lib-wooden_bucket_01', at(1.15, F, 4.7), { yaw: 150 }), bloomAt(1.15, F + 0.5, 4.7, 'bloom-white'));
  // 中央陈列岛：圆桌（花瓶、花篮、酢浆草）、小木桌加木箱；头顶花环
  push(model('island', 'lib-round_wooden_table_02', at(4.2, F, 3.4)));
  push(...vase('island-v1', 'lib-ceramic_vase_01', 4.05, F + 0.746, 3.3, 'bloom-pink'), model('island-basket', 'lib-wicker_basket_02', at(4.4, F + 0.746, 3.6), { yaw: 40 }), bloomAt(4.4, F + 0.92, 3.6, 'bloom-lilac'), model('island-sorrel', 'lib-shrub_sorrel_01', at(4.4, F + 0.746, 3.15)));
  push(model('side-table', 'lib-small_wooden_table_01', at(2.3, F, 1.9), { yaw: 90 }), model('side-crate', 'lib-wooden_crate_01', at(2.3, F + 0.533, 1.9), { yaw: 90 }), bloomAt(2.3, F + 0.88, 1.75, 'bloom-warm'), bloomAt(2.3, F + 0.88, 2.05, 'bloom-pink'));
  push(wreath('wreath', 4.2, F + H - 1.0, 3.4, 0.5));
  // 东墙层架（朝西）放花团，东南角高盆栽，门边阔叶盆栽
  push(model('east-shelf', 'lib-shelf_01', at(IX1 - 0.14, F, 4.1), { yaw: -90 }));
  [0.95, 1.45, 1.95].forEach((h, i) => push(bloomAt(IX1 - 0.16, F + h, 4.1, BLOOMS[i])));
  push(model('plant-tall', 'lib-potted_plant_01', at(5.55, F, 4.55), { yaw: 30 }), model('plant-leafy', 'lib-potted_plant_02', at(1.85, F, 4.55)));
  push(model('lamp-island', 'lib-hanging_industrial_lamp', at(4.2, F + H, 2.0)), model('lamp-floral', 'lib-hanging_industrial_lamp', at(2.0, F + H, 3.6)));

  // ================================================================ 门廊与街面
  const PY = F + 2.8;
  push(place('porch', group([
    ...[1.2, 4.8].map((x) => slab(x - 0.08, x + 0.08, street, PY, 6.9 - 0.08, 6.9 + 0.08, darkwood)),
    slab(1.0, 5.0, PY, PY + 0.16, 6.8, 7.0, darkwood), slab(1.0, 5.0, PY, PY + 0.16, Z1 + 0.05, Z1 + 0.25, darkwood),
    ...[1.5, 2.1, 2.7, 3.3, 3.9, 4.5].map((x) => slab(x - 0.04, x + 0.04, PY + 0.16, PY + 0.26, Z1 + 0.05, 7.05, darkwood)),
  ]), { kind: 'structure', label: '门廊' }));
  push(place('porch-sign', group([box([2.0, 0.5, 0.1], { at: [0, 0, 0], ...darkwood }), box([1.8, 0.26, 0.02], { at: [0, 0.12, 0.06], color: '#fff2cc', unlit: true })], { at: at(2.8, F + 2.45, Z1 + 0.1) }), { label: '门头招牌' }));
  push(model('porch-lamp-1', 'lib-lantern_chandelier_01', at(1.9, PY, 6.2)), model('porch-lamp-2', 'lib-lantern_chandelier_01', at(4.6, PY, 6.5)));
  push(model('porch-planter-1', 'lib-planter_box_02', at(1.1, street, 5.75)), model('porch-flowers-1', 'lib-periwinkle_plant', at(1.1, street + 0.3, 5.75)));
  // 阶梯花架（照参考图）：深色金属架，三级台阶各一排透明花桶插玫瑰，顶上灯箱招牌；左端矮柜放三盆绣球
  const SX0 = 3.5, SX1 = 5.95, SZ0 = Z1 + 0.05; // 架子靠南墙外皮，占 x 3.5–5.95、z 5.25–6.15
  const tiers = [[0.25, 0.9], [0.55, 0.6], [0.85, 0.3]] as const; // [台阶高, 台阶前沿离墙的距离]
  push(place('porch-stand', group([
    ...tiers.map(([h, d]) => slab(SX0, SX1, street, street + h, SZ0, SZ0 + d, { color: '#2a2b2d', roughness: 0.6, metalness: 0.3 })),
    ...[SX0 + 0.04, SX1 - 0.04].map((x) => slab(x - 0.03, x + 0.03, street, street + 2.3, SZ0, SZ0 + 0.06, { color: '#2a2b2d', metalness: 0.3 })),
    slab(SX0, SX1, street + 2.3, street + 2.36, SZ0, SZ0 + 0.06, { color: '#2a2b2d', metalness: 0.3 }),
    slab(SX0 - 0.02, SX1 + 0.02, street + 1.78, street + 2.3, SZ0 - 0.02, SZ0 + 0.1, { color: '#2a2b2d', metalness: 0.3 }),
    slab(SX0 + 0.04, SX1 - 0.04, street + 1.84, street + 2.24, SZ0 + 0.1, SZ0 + 0.115, { color: '#fff4e0', unlit: true }),
  ]), { label: '阶梯花架与灯箱' }));
  let rb = 0;
  tiers.forEach(([h, d], ti) => {
    for (let i = 0; i < 6; i += 1) {
      const x = SX0 + 0.22 + i * 0.4, z = SZ0 + d - 0.16;
      push(place(`rose-${String(++rb).padStart(2, '0')}`, instance((ti + i) % 3 === 0 ? 'rose-white' : 'rose-pink', { at: at(x, street + h, z), yaw: (i * 53) % 360 }), { templates, label: '玫瑰' }));
    }
  });
  push(place('porch-cabinet', slab(2.7, 3.45, street, street + 0.8, SZ0, SZ0 + 0.55, { color: '#2a2b2d', roughness: 0.6 }), { label: '矮柜' }));
  push(place('hyd-1', instance('hydrangea-blue', { at: at(2.85, street + 0.8, SZ0 + 0.27) }), { templates, label: '绣球' }), place('hyd-2', instance('hydrangea-pink', { at: at(3.08, street + 0.8, SZ0 + 0.3), yaw: 40 }), { templates, label: '绣球' }), place('hyd-3', instance('hydrangea-lilac', { at: at(3.3, street + 0.8, SZ0 + 0.26), yaw: 80 }), { templates, label: '绣球' }));
  push(model('porch-plant-1', 'lib-potted_plant_01', at(5.8, street, 6.6), { yaw: 190 }), model('porch-plant-2', 'lib-potted_plant_02', at(0.7, street, 6.5)));
  push(model('porch-board', 'lib-standing_chalkboard_01', at(1.9, street, 6.55), { yaw: -20 }), model('porch-bucket', 'lib-wooden_bucket_01', at(5.6, street, 6.95)), bloomAt(5.6, street + 0.5, 6.95, 'bloom-pink'));

  // ---------------------------------------------------------------- 锚点
  push(createAnchor(anchor('counter', 'counter', { box: [toGrid(ox + cX0), toGrid(F), toGrid(oz + cZ - 0.3), toGrid(ox + cX1), toGrid(F + 1.06), toGrid(oz + cZ + 0.3)] }, { label: '收银台' })));
  push(createAnchor(anchor('door', 'door', { position: at(2.8, F, Z1 - T / 2) }, { label: '出入口' })));
  push(createAnchor(anchor('window', 'zone', { box: [toGrid(ox + 3.8), toGrid(F), toGrid(oz + 4.6), toGrid(ox + 5.6), toGrid(F + 2.5), toGrid(oz + Z1)] }, { label: '橱窗' })));
  push(createAnchor(anchor('retail', 'zone', { box: [toGrid(ox + 2.0), toGrid(F), toGrid(oz + 2.0), toGrid(ox + IX1), toGrid(F + 2.5), toGrid(oz + IZ1)] }, { label: '零售区' })));
  push(createAnchor(anchor('floral', 'zone', { box: [toGrid(ox + IX0), toGrid(F), toGrid(oz + IZ0), toGrid(ox + 2.0), toGrid(F + 2.5), toGrid(oz + IZ1)] }, { label: '花艺区' })));

  return { message: '街角花店：6 × 5 米小店，收银区与零售花艺区，门廊街面', ops };
}
