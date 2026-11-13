import { readFileSync } from 'node:fs';
import type { BuildBase, EntityBody, Kit, Shape } from '@chrono-metaverse/sdk';

/**
 * 花店（flower-town）第三版：照「百花深」参考设计的平面图建，18 × 12 米，六个分区。
 *
 *   x 向东，z 向南，北墙在 z = 0；出入口在南墙正中（x 8.2–9.8）；南侧再留 2 米街面做门廊。
 *   咖啡区  x 0.2–5.5   z 0.2–6.5    石材地面，吧台靠东侧隔墙，圆桌和餐椅
 *   休憩区  x 0.2–5.5   z 6.5–11.8   石材地面、黄麻地毯、沙发和扶手椅，隔墙贴叠石
 *   零售区  x 5.5–12.5  z 0.2–6.5    橡木地板，靠墙书架和木格架，中央陈列岛，头顶花环
 *   花艺区  x 12.5–17.8 z 0.2–6.5    橡木地板，工作台、靠墙层架、花桶和花箱
 *   收银区  x 8.5–12.5  z 6.5–11.8   石材地面，收银台、背柜、招牌，去前厅的花从这里出发
 *   仓储区  x 13–17.8   z 6.7–11.8   水泥地面，钢架和木箱，独立门
 *   吊顶 3.0 米桧木板，分区线上有深色木梁，筒灯按 2 米网格；墙白灰泥，大面玻璃窗。
 *
 * 外部模型全部来自 Poly Haven（CC0），由 metaverse-recon 导出，署名在 props.source；
 * 贴图来自 Poly Haven（CC0），按实际尺寸平铺、固有色受光。锚点：counter（收银台，送花起点）、
 * door（出入口）、window（橱窗）和五个分区的 zone。
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
  const W = 18, D = 12; // 建筑外轮廓（米）
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
  const stone = tex('stone_tiles_02', 'planar');
  const concrete = tex('concrete_floor_01', 'planar');
  const hinoki = tex('hinoki_planks', 'planar', 90);
  const darkwood = tex('dark_wood', 'box');
  const stackedStone = tex('stacked_stone_wall', 'box');
  const hessian = tex('hessian_380', 'planar');
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
  const tDownlight = template('downlight', group([cylinder(0.08, 0.012, { color: '#ffe9c4', unlit: true }), cylinder(0.1, 0.006, { at: [0, 0.012, 0], color: '#eeeeee' })]), { label: '筒灯' });
  const templates = new Map<string, Shape>([
    ['bloom-pink', tBloomPink.shape!], ['bloom-warm', tBloomWarm.shape!], ['bloom-white', tBloomWhite.shape!], ['bloom-lilac', tBloomLilac.shape!], ['downlight', tDownlight.shape!],
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

  // ---------------------------------------------------------------- 分区边界
  const Z = { cafe: [0.2, 5.5, 0.2, 6.5], lounge: [0.2, 5.5, 6.5, 11.8], retail: [5.5, 12.5, 0.2, 6.5], floral: [12.5, 17.8, 0.2, 6.5], cashier: [8.5, 12.5, 6.5, 11.8], storage: [13.0, 17.8, 6.7, 11.8] } as const;

  const ops: unknown[] = [];
  const push = (...items: unknown[]) => { for (const i of items) if (i !== undefined) ops.push(i); };

  // ---------------------------------------------------------------- 街面与地面
  push(addBlock('pavement', 'solid', { color: '#c9c3b8' }), fill(cells([toGrid(ox), toGrid(oy), toGrid(oz)], [360, 1, 280]), 'pavement'));
  push(place('floor-cafe', slab(...([Z.cafe[0], Z.cafe[1], street, F, Z.cafe[2], Z.cafe[3]] as const), stone), { kind: 'structure', label: '咖啡区石材地面' }));
  push(place('floor-lounge', slab(0.2, 5.5, street, F, 6.5, 11.8, stone), { kind: 'structure', label: '休憩区石材地面' }));
  push(place('floor-cashier', slab(5.5, 13.0, street, F, 6.5, 11.8, stone), { kind: 'structure', label: '收银区石材地面' }));
  push(place('floor-retail', slab(5.5, 12.5, street, F, 0.2, 6.5, oak), { kind: 'structure', label: '零售区木地板' }));
  push(place('floor-floral', slab(12.5, 17.8, street, F, 0.2, 6.5, oak), { kind: 'structure', label: '花艺区木地板' }));
  push(place('floor-storage', slab(13.0, 17.8, street, F, 6.7, 11.8, concrete), { kind: 'structure', label: '仓储区水泥地面' }));
  push(place('floor-porch', slab(5.5, 12.5, street, F, 12.2, 14.0, terracotta), { kind: 'structure', label: '门廊地砖' }));
  push(place('rug-lounge', slab(1.3, 4.5, F, F + 0.012, 8.0, 10.8, hessian), { label: '黄麻地毯' }));

  // ---------------------------------------------------------------- 外墙（带窗）与出入口
  push(place('wall-north', group(wallX(0, W, 0, T, [
    { from: 0.6, to: 4.9, sill: 0.9, height: 1.7 }, { from: 6.2, to: 11.8, sill: 1.4, height: 1.3 }, { from: 13.0, to: 17.4, sill: 0.9, height: 1.7 },
  ])), { kind: 'structure', label: '北墙' }));
  push(place('wall-south', group(wallX(0, W, D - T, D, [
    { from: 0.6, to: 5.0, sill: 0.3, height: 2.3 }, { from: 8.2, to: 9.8, sill: 0, height: 2.4, glass: false }, { from: 10.4, to: 12.2, sill: 0.9, height: 1.5 },
  ])), { kind: 'structure', label: '南墙' }));
  push(place('wall-west', group(wallZ(T, D - T, 0, T, [
    { from: 0.8, to: 3.6, sill: 0.9, height: 1.7 }, { from: 7.0, to: 11.4, sill: 0.3, height: 2.3 },
  ])), { kind: 'structure', label: '西墙' }));
  push(place('wall-east', group(wallZ(T, D - T, W - T, W, [
    { from: 0.6, to: 5.8, sill: 0.9, height: 1.7 }, { from: 8.0, to: 9.4, sill: 1.5, height: 1.0 },
  ])), { kind: 'structure', label: '东墙' }));
  // 门：两扇玻璃木框门，开 35 度
  const leaf = (id: string, x: number, yaw: number) => place(id, group([
    box([0.78, 2.35, 0.04], { at: [0, 0, 0], ...darkwood }),
    box([0.6, 1.9, 0.02], { at: [0, 0.3, 0], color: '#d6e6ee', opacity: 0.3 }),
  ], { at: at(x, F, D - T / 2), yaw }), { label: '门' });
  push(leaf('door-left', 8.6, 35), leaf('door-right', 9.4, -35));

  // ---------------------------------------------------------------- 隔墙
  push(place('wall-storage-w', group(wallZ(6.7, D - T, 13.0 - t, 13.0, [{ from: 10.3, to: 11.2, sill: 0, height: 2.1, glass: false }])), { kind: 'structure', label: '仓储区西墙' }));
  push(place('wall-storage-n', group(wallX(13.0, W - T, 6.7 - t, 6.7, [])), { kind: 'structure', label: '仓储区北墙' }));
  push(place('wall-cafe-lounge', group(wallX(T, 3.6, 6.5 - t / 2, 6.5 + t / 2, [])), { kind: 'structure', label: '咖啡区与休憩区隔墙' }));
  // 休憩区东侧隔墙：面向休憩区贴叠石，留出通道 z 9.0–10.6
  push(place('wall-lounge-e', group([...wallZ(6.5, 9.0, 5.5 - t / 2, 5.5 + t / 2, [], stackedStone), ...wallZ(10.6, D - T, 5.5 - t / 2, 5.5 + t / 2, [], stackedStone)]), { kind: 'structure', label: '休憩区叠石隔墙' }));
  // 咖啡区东侧：吧台背墙（半高）
  push(place('wall-cafe-e', group(wallZ(0.8, 5.2, 5.5 - t / 2, 5.5 + t / 2, [{ from: 1.0, to: 4.6, sill: 1.2, height: 1.8, glass: false }])), { kind: 'structure', label: '咖啡区半高隔墙' }));

  // ---------------------------------------------------------------- 吊顶、梁、筒灯
  push(place('ceiling', slab(T, W - T, F + H, F + H + 0.05, T, D - T, hinoki), { kind: 'structure', label: '桧木吊顶' }));
  push(place('beams', group([
    slab(5.4, 5.6, F + H - 0.25, F + H, T, D - T, darkwood), slab(12.4, 12.6, F + H - 0.25, F + H, T, 6.5, darkwood),
    slab(T, W - T, F + H - 0.25, F + H, 6.4, 6.6, darkwood), slab(T, W - T, F + H - 0.25, F + H, 0.2, 0.4, darkwood),
  ]), { kind: 'structure', label: '木梁' }));
  push(placeEntity(tDownlight));
  let dl = 0;
  for (let x = 1.5; x < W - 0.5; x += 2.0) for (let z = 1.5; z < D - 0.5; z += 2.0) {
    push(place(`downlight-${String(++dl).padStart(2, '0')}`, instance('downlight', { at: at(x, F + H - 0.012, z) }), { templates, label: '筒灯' }));
  }

  // ---------------------------------------------------------------- 模板
  push(placeEntity(tBloomPink), placeEntity(tBloomWarm), placeEntity(tBloomWhite), placeEntity(tBloomLilac));

  // ================================================================ 咖啡区
  // 吧台：橡木，沿东侧半高隔墙，正面朝西；台面上咖啡机、杯子
  const barX = 4.6, barZ0 = 1.2, barZ1 = 4.4;
  push(place('cafe-bar', group([
    slab(barX, barX + 0.6, F + 0.1, F + 1.02, barZ0, barZ1, oak), slab(barX - 0.03, barX + 0.63, F + 1.02, F + 1.06, barZ0 - 0.03, barZ1 + 0.03, { color: '#efe9df', roughness: 0.6 }),
    slab(barX + 0.05, barX + 0.55, F, F + 0.1, barZ0 + 0.05, barZ1 - 0.05, { color: '#2f2a26' }),
  ]), { label: '咖啡吧台' }));
  push(place('espresso-machine', group([
    box([0.55, 0.42, 0.45], { at: [0, 0, 0], fillet: 0.02, color: '#2b2b2b', metalness: 0.4, roughness: 0.5 }),
    box([0.5, 0.06, 0.4], { at: [0, 0.42, 0], color: '#b8b8b8', metalness: 0.5, roughness: 0.4 }),
    cylinder(0.02, 0.12, { at: [-0.15, 0.3, 0.2], color: '#9a9a9a', metalness: 0.5 }), cylinder(0.02, 0.12, { at: [0.15, 0.3, 0.2], color: '#9a9a9a', metalness: 0.5 }),
  ], { at: at(barX + 0.3, F + 1.06, 2.8), yaw: 90 }), { label: '咖啡机' }));
  push(place('cups', group(Array.from({ length: 6 }, (_, i) => cylinder(0.04, 0.08, { at: [0, 0, i * 0.11], color: '#f6f1e8' })), { at: at(barX + 0.3, F + 1.06, 1.4) }), { label: '咖啡杯' }));
  push(model('stool-01', 'lib-bar_chair_round_01', at(barX - 0.5, F, 1.8)), model('stool-02', 'lib-bar_chair_round_01', at(barX - 0.5, F, 2.6), { yaw: 20 }), model('stool-03', 'lib-bar_chair_round_01', at(barX - 0.5, F, 3.4), { yaw: -15 }));
  push(place('cafe-shelf', group([slab(5.2, 5.42, F + 1.5, F + 1.53, 1.3, 4.3, oak), slab(5.2, 5.42, F + 2.0, F + 2.03, 1.3, 4.3, oak)]), { label: '吧台背架' }));
  push(...vase('cafe-vase-1', 'lib-ceramic_vase_02', 5.31, F + 1.53, 1.6, 'bloom-white'), ...vase('cafe-vase-2', 'lib-ceramic_vase_04', 5.31, F + 2.03, 2.4, 'bloom-pink'), model('cafe-pot', 'lib-brass_pot_01', at(5.31, F + 1.53, 3.6)));
  // 圆桌 + 餐椅两组，方桌一组
  const seat2 = (id: string, x: number, z: number, yaw: number) => [
    model(`${id}-table`, 'lib-round_wooden_table_02', at(x, F, z)),
    model(`${id}-chair-a`, 'lib-dining_chair_02', at(x, F, z - 0.62), { yaw: 180 + yaw }), model(`${id}-chair-b`, 'lib-dining_chair_02', at(x, F, z + 0.62), { yaw }),
    ...vase(`${id}-vase`, 'lib-ceramic_vase_04', x, F + 0.746, z, 'bloom-pink'),
  ];
  push(...seat2('cafe-t1', 1.6, 2.0, 0), ...seat2('cafe-t2', 1.6, 4.3, 15));
  push(model('cafe-t3', 'lib-wooden_table_02', at(3.2, F, 5.4), { yaw: 90 }), model('cafe-t3-chair-a', 'lib-gallinera_chair', at(2.5, F, 5.4), { yaw: -90 }), model('cafe-t3-chair-b', 'lib-gallinera_chair', at(3.9, F, 5.4), { yaw: 90 }));
  push(model('cafe-plant-1', 'lib-potted_plant_01', at(0.7, F, 0.8), { yaw: 30 }), model('cafe-plant-2', 'lib-potted_plant_02', at(0.7, F, 5.9)));
  push(model('cafe-lamp-1', 'lib-modern_ceiling_lamp_01', at(3.9, F + H - 1.17, 1.8)), model('cafe-lamp-2', 'lib-modern_ceiling_lamp_01', at(3.9, F + H - 1.17, 2.8)), model('cafe-lamp-3', 'lib-modern_ceiling_lamp_01', at(3.9, F + H - 1.17, 3.8)));
  push(model('cafe-frame', 'lib-hanging_picture_frame_02', at(2.0, F + 1.9, 6.5 - t / 2 - 0.02)));
  push(model('cafe-crate', 'lib-wooden_crate_01', at(1.2, F, 6.1)), bloomAt(1.2, F + 0.35, 6.1, 'bloom-lilac'));

  // ================================================================ 休憩区
  push(model('lounge-sofa-1', 'lib-sofa_03', at(2.9, F, 7.5), { yaw: 180 }), model('lounge-sofa-2', 'lib-sofa_02', at(1.0, F, 9.4), { yaw: 90 }));
  push(model('lounge-arm-1', 'lib-armchair_01', at(4.6, F, 8.6), { yaw: -90 }), model('lounge-arm-2', 'lib-mid_century_lounge_chair', at(4.5, F, 10.6), { yaw: -90 }));
  push(model('lounge-coffee', 'lib-modern_coffee_table_01', at(2.9, F, 9.3), { yaw: 90 }), ...vase('lounge-vase', 'lib-ceramic_vase_01', 2.9, F + 0.39, 9.3, 'bloom-warm'));
  push(model('lounge-side', 'lib-side_table_01', at(0.8, F, 11.0)), model('lounge-succ', 'lib-potted_plant_04', at(0.8, F + 0.55, 11.0)));
  push(model('lounge-plant-1', 'lib-potted_plant_01', at(0.8, F, 7.2), { yaw: 60 }), model('lounge-plant-2', 'lib-potted_plant_02', at(4.9, F, 11.3)), model('lounge-plant-3', 'lib-potted_plant_02', at(4.9, F, 7.0), { yaw: 30 }));
  push(model('lounge-frame-1', 'lib-hanging_picture_frame_02', at(2.0, F + 2.0, 6.5 + t / 2 + 0.02), { yaw: 180 }), model('lounge-frame-2', 'lib-hanging_picture_frame_02', at(3.9, F + 2.0, 6.5 + t / 2 + 0.02), { yaw: 180 }));
  push(model('lounge-lamp', 'lib-lantern_chandelier_01', at(2.9, F + H, 9.3)));
  push(model('lounge-books', 'lib-wooden_bookshelf_worn', at(0.5, F, 7.2 + 0.0), { yaw: 90 }));

  // ================================================================ 零售区
  // 北墙靠墙：书架 ×2、高柜；西侧木格架 ×2（正面朝东）；中央陈列岛
  push(model('retail-shelf-1', 'lib-wooden_bookshelf_worn', at(6.9, F, 0.5)), model('retail-shelf-2', 'lib-wooden_bookshelf_worn', at(8.4, F, 0.5)));
  push(model('retail-cabinet', 'lib-painted_wooden_cabinet_02', at(11.9, F, 0.58)));
  push(model('retail-grid-1', 'lib-wooden_display_shelves_01', at(5.9, F, 2.4)), model('retail-grid-2', 'lib-wooden_display_shelves_01', at(5.9, F, 4.0)));
  push(model('retail-island-1', 'lib-small_wooden_table_01', at(8.6, F, 3.4)), model('retail-island-2', 'lib-round_wooden_table_02', at(9.8, F, 3.9)), model('retail-crate-1', 'lib-wooden_crate_01', at(8.6, F + 0.533, 3.4)), model('retail-crate-2', 'lib-wooden_crate_01', at(8.0, F, 4.4), { yaw: 90 }));
  push(...vase('retail-v1', 'lib-antique_ceramic_vase_01', 9.8, F + 0.746, 3.9, 'bloom-pink'), ...vase('retail-v2', 'lib-ceramic_vase_02', 8.6, F + 0.883, 3.3, 'bloom-white'), ...vase('retail-v3', 'lib-brass_vase_02', 8.0, F + 0.35, 4.4, 'bloom-lilac'));
  push(model('retail-basket-1', 'lib-wicker_basket_02', at(9.5, F + 0.746, 4.2), { yaw: 40 }), bloomAt(9.5, F + 0.92, 4.2, 'bloom-warm'));
  push(model('retail-basket-2', 'lib-wicker_basket_01', at(10.1, F + 0.746, 3.6)), model('retail-pot', 'lib-ceramic_pot', at(10.6, F, 5.6)));
  push(wreath('retail-wreath', 9.2, F + H - 1.05, 3.6, 0.6));
  push(model('retail-lamp-1', 'lib-hanging_industrial_lamp', at(7.2, F + H, 3.2)), model('retail-lamp-2', 'lib-hanging_industrial_lamp', at(11.3, F + H, 3.2)));
  push(model('retail-plant-1', 'lib-potted_plant_01', at(12.0, F, 5.9), { yaw: 100 }), model('retail-plant-2', 'lib-potted_plant_02', at(6.0, F, 5.8)));
  // 墙上一排小花瓶（书架顶）
  push(...vase('retail-v4', 'lib-ceramic_vase_04', 6.9, F + 2.06, 0.5, 'bloom-pink'), ...vase('retail-v5', 'lib-ceramic_vase_01', 8.4, F + 2.06, 0.5, 'bloom-white'));
  push(model('retail-succ-1', 'lib-potted_plant_04', at(5.9, F + 1.556, 2.2)), model('retail-succ-2', 'lib-potted_plant_04', at(5.9, F + 1.556, 4.2), { yaw: 50 }));

  // ================================================================ 花艺区
  push(model('floral-bench', 'lib-painted_wooden_table', at(15.2, F, 3.6)));
  push(model('floral-can', 'lib-watering_can_metal_01', at(14.3, F + 0.96, 3.3), { yaw: 30 }), model('floral-basket', 'lib-wicker_basket_01', at(16.0, F + 0.96, 3.9)));
  push(...vase('floral-v1', 'lib-ceramic_vase_01', 15.3, F + 0.96, 3.5, 'bloom-lilac'), ...vase('floral-v2', 'lib-ceramic_vase_02', 15.9, F + 0.96, 3.2, 'bloom-warm'), ...vase('floral-v3', 'lib-brass_vase_02', 14.6, F + 0.96, 4.0, 'bloom-white'));
  push(model('floral-chair', 'lib-gallinera_chair', at(15.2, F, 4.9), { yaw: 180 }));
  push(model('floral-shelf-1', 'lib-shelf_01', at(17.6, F, 1.6), { yaw: -90 }), model('floral-shelf-2', 'lib-shelf_01', at(17.6, F, 4.4), { yaw: -90 }));
  [1.0, 1.5, 2.0].forEach((h, i) => push(bloomAt(17.5, F + h, 1.6, BLOOMS[i]), bloomAt(17.5, F + h, 4.4, BLOOMS[(i + 2) % 4])));
  push(model('floral-planter-1', 'lib-planter_box_03', at(13.4, F, 0.8)), model('floral-flowers-1', 'lib-flower_gazania', at(13.4, F + 0.7, 0.8)));
  push(model('floral-planter-2', 'lib-planter_box_02', at(15.4, F, 0.75)), model('floral-flowers-2', 'lib-periwinkle_plant', at(15.4, F + 0.3, 0.75)));
  [13.2, 13.7, 14.2, 14.7].forEach((x, i) => push(model(`floral-bucket-${i + 1}`, 'lib-wooden_bucket_01', at(x, F, 5.9), { yaw: i * 50 }), bloomAt(x, F + 0.5, 5.9, BLOOMS[(i + 1) % 4])));
  push(model('floral-crate', 'lib-wooden_crate_02', at(17.0, F, 6.0), { yaw: 90 }), model('floral-plant', 'lib-potted_plant_01', at(13.0, F, 3.2), { yaw: -40 }));
  push(model('floral-lamp', 'lib-hanging_industrial_lamp', at(15.2, F + H, 3.6)));

  // ================================================================ 收银区
  const cX0 = 9.2, cX1 = 12.0, cZ = 7.9;
  push(place('cashier-counter', group([
    slab(cX0, cX1, F + 0.1, F + 1.02, cZ - 0.3, cZ + 0.3, oak), slab(cX0 - 0.03, cX1 + 0.03, F + 1.02, F + 1.06, cZ - 0.33, cZ + 0.33, { color: '#efe9df', roughness: 0.6 }),
    slab(cX0 + 0.05, cX1 - 0.05, F, F + 0.1, cZ - 0.25, cZ + 0.25, { color: '#2f2a26' }),
  ]), { label: '收银台', anchorId: 'counter', props: { 说明: '送花从这里出发' } }));
  push(model('cashier-register', 'lib-cashregister_01', at(11.4, F + 1.06, cZ), { yaw: 180 }));
  push(...vase('cashier-vase', 'lib-antique_ceramic_vase_01', 9.6, F + 1.06, cZ - 0.05, 'bloom-pink'));
  push(model('cashier-basket', 'lib-wicker_basket_02', at(10.4, F + 1.06, cZ - 0.06), { yaw: 15, label: '发布会花篮样品' }), bloomAt(10.4, F + 1.24, cZ - 0.06, 'bloom-warm'));
  push(model('cashier-cabinet', 'lib-modern_wooden_cabinet', at(10.6, F, 6.5 + 0.3)));
  push(...vase('cashier-v2', 'lib-ceramic_vase_02', 9.8, F + 0.68, 6.8, 'bloom-white'), ...vase('cashier-v3', 'lib-brass_vase_02', 11.4, F + 0.68, 6.8, 'bloom-lilac'));
  // 招牌：深色木板 + 暖光灯带，在背柜上方
  push(place('cashier-sign', group([box([2.4, 0.5, 0.08], { at: [0, 0, 0], ...darkwood }), box([2.2, 0.06, 0.02], { at: [0, -0.08, 0.04], color: '#ffd98a', unlit: true })], { at: at(10.6, F + 2.1, 6.5 + 0.08) }), { label: '招牌' }));
  // 墙上圆形标志（仓储区西墙，朝西）
  push(place('cashier-logo', group([cylinder(0.38, 0.04, { roll: 90, color: '#e8d9b8', roughness: 0.7 }), cylinder(0.3, 0.01, { at: [-0.045, 0, 0], roll: 90, color: '#fff2cc', unlit: true })], { at: at(13.0 - t / 2 - 0.03, F + 1.8, 8.6) }), { label: '标志' }));
  push(model('cashier-plant', 'lib-potted_plant_01', at(12.4, F, 11.2), { yaw: 200 }), model('cashier-cart', 'lib-wooden_crate_02', at(8.0, F, 9.0), { yaw: 90 }));
  [7.6, 8.0, 8.4].forEach((x, i) => push(bloomAt(x, F + 0.46, 9.0, BLOOMS[i])));
  push(model('wait-table', 'lib-woodentable_03', at(6.6, F, 10.6), { yaw: 90 }), model('wait-chair-1', 'lib-gallinera_chair', at(6.0, F, 10.6), { yaw: -90 }), model('wait-chair-2', 'lib-gallinera_chair', at(7.2, F, 10.6), { yaw: 90 }));
  push(model('hall-plant-1', 'lib-potted_plant_02', at(6.0, F, 7.0)), model('hall-planter', 'lib-planter_box_01', at(7.4, F, 6.9)), model('hall-flowers', 'lib-flower_empodium', at(7.4, F + 0.3, 6.9)));

  // ================================================================ 仓储区
  push(model('store-rack-1', 'lib-steel_frame_shelves_03', at(17.4, F, 8.0), { yaw: -90 }), model('store-rack-2', 'lib-steel_frame_shelves_03', at(17.4, F, 10.5), { yaw: -90 }));
  push(model('store-crate-1', 'lib-wooden_crate_01', at(14.0, F, 11.2)), model('store-crate-2', 'lib-wooden_crate_01', at(14.0, F + 0.35, 11.2), { yaw: 10 }), model('store-planter', 'lib-planter_box_01', at(14.2, F, 7.4)), model('store-bucket', 'lib-wooden_bucket_01', at(15.6, F, 11.3)));
  push(model('store-stool', 'lib-metal_stool_02', at(15.0, F, 9.5)));

  // ================================================================ 门廊与街面
  const PY = F + 2.85;
  push(place('porch', group([
    ...[6.6, 11.4].map((x) => slab(x - 0.08, x + 0.08, street, PY, 13.5 - 0.08, 13.5 + 0.08, darkwood)),
    slab(6.4, 11.6, PY, PY + 0.18, 13.4, 13.6, darkwood), slab(6.4, 11.6, PY, PY + 0.18, 12.15, 12.35, darkwood),
    ...[6.8, 7.6, 8.4, 9.2, 10.0, 10.8].map((x) => slab(x - 0.05, x + 0.05, PY + 0.18, PY + 0.3, 12.1, 13.65, darkwood)),
  ]), { kind: 'structure', label: '门廊' }));
  push(place('porch-sign', group([box([2.6, 0.6, 0.1], { at: [0, 0, 0], ...darkwood }), box([2.3, 0.3, 0.02], { at: [0, 0.15, 0.06], color: '#fff2cc', unlit: true })], { at: at(9.0, F + 2.5, 12.0 + 0.1) }), { label: '门头招牌' }));
  push(model('porch-lamp-1', 'lib-lantern_chandelier_01', at(7.3, PY, 12.9)), model('porch-lamp-2', 'lib-lantern_chandelier_01', at(10.7, PY, 12.9)));
  push(model('porch-planter-1', 'lib-planter_box_02', at(7.2, street, 12.7)), model('porch-flowers-1', 'lib-periwinkle_plant', at(7.2, street + 0.3, 12.7)));
  push(model('porch-planter-2', 'lib-planter_box_02', at(10.8, street, 12.7)), model('porch-flowers-2', 'lib-flower_empodium', at(10.8, street + 0.3, 12.7)));
  push(model('porch-plant-1', 'lib-potted_plant_01', at(6.0, street, 12.8), { yaw: 15 }), model('porch-plant-2', 'lib-potted_plant_01', at(12.0, street, 12.8), { yaw: 190 }));
  push(model('porch-plant-3', 'lib-potted_plant_02', at(8.0, street, 13.3)), model('porch-plant-4', 'lib-potted_plant_02', at(10.0, street, 13.3), { yaw: 70 }));
  push(model('porch-board', 'lib-standing_chalkboard_01', at(11.0, street, 13.4), { yaw: 20 }));
  push(model('porch-pot', 'lib-ceramic_pot', at(5.9, street, 13.6)), model('porch-bucket', 'lib-wooden_bucket_01', at(12.2, street, 13.6)), bloomAt(12.2, street + 0.5, 13.6, 'bloom-pink'));

  // ---------------------------------------------------------------- 锚点
  const zoneAnchor = (id: string, b: readonly [number, number, number, number], label: string) =>
    createAnchor(anchor(id, 'zone', { box: [toGrid(ox + b[0]), toGrid(F), toGrid(oz + b[2]), toGrid(ox + b[1]), toGrid(F + 2.5), toGrid(oz + b[3])] }, { label }));
  push(createAnchor(anchor('counter', 'counter', { box: [toGrid(ox + cX0), toGrid(F), toGrid(oz + cZ - 0.3), toGrid(ox + cX1), toGrid(F + 1.06), toGrid(oz + cZ + 0.3)] }, { label: '收银台' })));
  push(createAnchor(anchor('door', 'door', { position: at(9.0, F, D - T / 2) }, { label: '出入口' })));
  push(createAnchor(anchor('window', 'zone', { box: [toGrid(ox + 0.6), toGrid(F), toGrid(oz + D - 0.5), toGrid(ox + 5.0), toGrid(F + 2.6), toGrid(oz + D)] }, { label: '橱窗' })));
  push(zoneAnchor('cafe', Z.cafe, '咖啡区'), zoneAnchor('lounge', Z.lounge, '休憩区'), zoneAnchor('retail', Z.retail, '零售区'), zoneAnchor('floral', Z.floral, '花艺区'), zoneAnchor('storage', Z.storage, '仓储区'));

  return { message: '花店按「百花深」参考设计重建：六个分区、门廊街面、贴图与模型库物件', ops };
}
