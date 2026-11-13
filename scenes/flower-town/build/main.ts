import type { BuildBase, Kit } from '@chrono-metaverse/sdk';

/**
 * 街角花店（flower-town）：一间 4.4 × 4.4 米的小店，建在地块 `shop`（5 × 5 米）里。
 *
 * 照查看器夹具里的「街角花店」布置，按真实尺寸：
 * - 结构：方块地台、三面实墙，南墙（临街）开一扇门和一面橱窗；
 * - 物件：柜台（送花起点）、台面上的花束、柜台后北墙一排花桶（模板 + 实例）、东墙花架、
 *   橱窗里的圆桌展台、门上方的营业灯箱；
 * - 锚点：`counter` 柜台（送花起点，公开）、`door` 门口（组合里和前厅相连，公开）、`window` 橱窗（公开）。
 *
 * 每次 build 从基础状态重新生成，编号固定，重复运行只更新不堆叠。
 */
export default function build(base: BuildBase, kit: Kit) {
  const { addBlock, fill, cells, toGrid, place, placeEntity, template, instance } = kit;
  const { wall, doorOpening, windowOpening, counter, shelf, table } = kit;
  const { box, cylinder, cone, lathe, group, anchor, createAnchor } = kit;

  const [ox, oy, oz] = base.target.origin ?? [0, 0, 0]; // 地块最小角（米）
  const floor = oy + 0.05; // 地台一格厚（5 厘米），家具放在地台上
  const at = (x: number, y: number, z: number): [number, number, number] => [ox + x, y, oz + z];

  // 店面范围（相对地块）：x、z 各留 0.3 米走道，墙中线离边 0.36 米（墙厚 0.12）。
  const inner = { x0: 0.3, x1: 4.7, z0: 0.3, z1: 4.7 };
  const wallHeight = 2.8;

  // ---- 模板：花桶（锌桶 + 一簇绿叶 + 花团）和花束（玻璃瓶 + 绿叶 + 花团）----
  const bucketShape = group([
    cylinder(0.14, 0.36, { radiusTop: 0.17, fillet: 0.01, color: '#969ca2' }),
    cone(0.2, 0.42, { at: [0, 0.34, 0], color: '#488450' }),
    lathe(
      [
        [0, 0],
        [0.12, 0.04],
        [0.16, 0.12],
        [0.1, 0.2],
        [0, 0.22],
      ],
      { at: [0, 0.6, 0], color: '#e25878' },
    ),
  ]);
  const vaseShape = group([
    lathe(
      [
        [0, 0],
        [0.06, 0],
        [0.08, 0.06],
        [0.05, 0.18],
        [0.07, 0.24],
        [0, 0.24],
      ],
      { color: '#bcd7e6', opacity: 0.5 },
    ),
    cone(0.13, 0.26, { at: [0, 0.22, 0], color: '#4f8f55' }),
    lathe(
      [
        [0, 0],
        [0.1, 0.03],
        [0.13, 0.1],
        [0.08, 0.17],
        [0, 0.19],
      ],
      { at: [0, 0.42, 0], color: '#f28bb1' },
    ),
  ]);
  const bucketTemplate = template('bucket', bucketShape, { label: '花桶' });
  const vaseTemplate = template('vase', vaseShape, { label: '花束' });
  const templates = new Map([
    ['bucket', bucketTemplate.shape!],
    ['vase', vaseTemplate.shape!],
  ]);

  const ops = [
    // ---- 地台：整块地块铺一层 5 厘米的地砖色方块（店内和门口的街面）----
    addBlock('shop-floor', 'solid', { color: '#d8c9b8' }),
    fill(cells([toGrid(ox), toGrid(oy), toGrid(oz)], [100, 1, 100]), 'shop-floor'),

    // ---- 墙：北、西、东三面实墙；南墙临街，开门（宽 0.9）和橱窗（宽 2.2、台高 0.5）----
    place(
      'wall-north',
      wall({ from: [ox + inner.x0, oz + inner.z0 + 0.06], to: [ox + inner.x1, oz + inner.z0 + 0.06], base: floor, height: wallHeight, color: '#eee2d6' }),
      { kind: 'structure', label: '北墙' },
    ),
    place(
      'wall-west',
      wall({ from: [ox + inner.x0 + 0.06, oz + inner.z0], to: [ox + inner.x0 + 0.06, oz + inner.z1], base: floor, height: wallHeight, color: '#eee2d6' }),
      { kind: 'structure', label: '西墙' },
    ),
    place(
      'wall-east',
      wall({ from: [ox + inner.x1 - 0.06, oz + inner.z0], to: [ox + inner.x1 - 0.06, oz + inner.z1], base: floor, height: wallHeight, color: '#eee2d6' }),
      { kind: 'structure', label: '东墙' },
    ),
    place(
      'wall-south',
      wall({
        from: [ox + inner.x0, oz + inner.z1 - 0.06],
        to: [ox + inner.x1, oz + inner.z1 - 0.06],
        base: floor,
        height: wallHeight,
        color: '#eee2d6',
        openings: [
          doorOpening(0.5, { width: 0.9, height: 2.1 }),
          windowOpening(2.0, { width: 2.2, sill: 0.5, height: 1.8 }),
        ],
      }),
      { kind: 'structure', label: '临街的南墙：门和橱窗' },
    ),

    // ---- 柜台：送花从这里出发。正面朝门（+z），长 1.6、深 0.6、高 1.05 ----
    place('counter', counter({ length: 1.6, depth: 0.6, height: 1.05, at: at(2.5, floor, 1.6), bodyColor: '#6d5643', topColor: '#e8e2d6' }), {
      label: '柜台',
      anchorId: 'counter',
      props: { 说明: '送花从这里出发' },
    }),

    // ---- 模板和实例 ----
    placeEntity(bucketTemplate),
    placeEntity(vaseTemplate),
    // 柜台台面上两束花（台面顶 = 地台 + 1.05）。
    place('vase-counter-01', instance('vase', { at: at(2.0, floor + 1.05, 1.6) }), { templates, label: '花束' }),
    place('vase-counter-02', instance('vase', { at: at(3.0, floor + 1.05, 1.6), yaw: 30 }), { templates, label: '花束' }),
    // 北墙、柜台后面一排六个花桶（门在西南角，西墙留作进店走道），每个转一点角度。
    ...[0.9, 1.4, 1.9, 2.4, 2.9, 3.4].map((x, i) =>
      place(`bucket-${String(i + 1).padStart(2, '0')}`, instance('bucket', { at: at(x, floor, 0.75), yaw: i * 40 }), {
        templates,
        label: '花桶',
      }),
    ),

    // ---- 东墙花架：宽 1.4、深 0.35、高 1.8，四层；正面朝西（yaw -90 把局部 +z 转到 -x）----
    place('shelf', shelf({ width: 1.4, depth: 0.35, height: 1.8, shelves: 4, at: at(4.4, floor, 2.6), yaw: -90 }), { label: '花架' }),
    // 花架第二、三层各放一束花（层高 = (1.8 - 0.02) × i / 3）。
    place('vase-shelf-01', instance('vase', { at: at(4.4, floor + 0.5933, 2.3) }), { templates, label: '花束' }),
    place('vase-shelf-02', instance('vase', { at: at(4.4, floor + 0.5933, 2.9), yaw: 60 }), { templates, label: '花束' }),
    place('vase-shelf-03', instance('vase', { at: at(4.4, floor + 1.1867, 2.6), yaw: 120 }), { templates, label: '花束' }),

    // ---- 橱窗里的圆桌展台（直径 0.8，靠橱窗内侧）和它上面的花束 ----
    place('display-table', table({ top: 'round', width: 0.8, height: 0.75, at: at(3.4, floor, 3.9) }), { label: '橱窗展台' }),
    place('vase-display', instance('vase', { at: at(3.4, floor + 0.75, 3.9) }), { templates, label: '橱窗花束' }),

    // ---- 门上方的营业灯箱：不受光照的黄色薄盒，挂在南墙外侧 ----
    place('sign-open', box([0.7, 0.22, 0.04], { at: at(1.25, floor + 2.3, 4.73), color: '#f2c14e', unlit: true }), {
      label: '营业中',
    }),

    // ---- 锚点：柜台（送花起点）、门口（和前厅相连）、橱窗 ----
    createAnchor(
      anchor('counter', 'counter', {
        box: [toGrid(ox + 1.7), toGrid(floor), toGrid(oz + 1.3), toGrid(ox + 3.3), toGrid(floor + 1.05), toGrid(oz + 1.9)],
      }, { label: '柜台' }),
    ),
    createAnchor(anchor('door', 'door', { position: at(1.25, floor, 4.64) }, { label: '花店门口' })),
    createAnchor(
      anchor('window', 'zone', {
        box: [toGrid(ox + 2.3), toGrid(floor), toGrid(oz + 3.6), toGrid(ox + 4.5), toGrid(floor + 2.3), toGrid(oz + 4.7)],
      }, { label: '橱窗' }),
    ),
  ];
  return { message: '街角花店：店面、柜台、花桶、花架与橱窗', ops };
}
