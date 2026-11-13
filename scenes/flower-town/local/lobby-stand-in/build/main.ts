import type { BuildBase, Kit } from '@chrono-metaverse/sdk';

/** 前厅替身：只为本地联调订花流程——一张前台（收货台）和它的公开锚点 counter-01，与线上前厅的锚点编号一致。 */
export default function build(base: BuildBase, kit: Kit) {
  const { place, box, createAnchor, anchor, toGrid } = kit;
  const [x, y, z] = base.target.origin ?? [0, 0, 0];
  const cx = x + 5.0, cz = z + 2.0;
  return {
    message: '前厅替身：前台与收货台锚点',
    ops: [
      place('floor', box([10, 0.05, 10], { at: [x + 5, y, z + 5], color: '#d9d4cc' }), { label: '地面' }),
      place('counter-01', box([2.4, 1.05, 0.6], { at: [cx, y + 0.05, cz], color: '#8a6a4f' }), { label: '前台', anchorId: 'counter-01' }),
      createAnchor(anchor('counter-01', 'counter', { box: [toGrid(cx - 1.2), toGrid(y), toGrid(cz - 0.3), toGrid(cx + 1.2), toGrid(y + 1.05), toGrid(cz + 0.3)] }, { label: '前台（收货台）' })),
    ],
  };
}
