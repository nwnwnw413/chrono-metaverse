import { readFileSync } from 'node:fs';
import type { BuildBase, Kit } from '@chrono-metaverse/sdk';

/**
 * 前厅门口的「找 AI 前台订座」黑板：和街角花店门口的一样，黑板上贴发布会前台 Telegram bot 的二维码，
 * 二维码板登记为位置标记，页面上点「扫码订座 · Telegram」镜头推到黑板前。
 *
 * 位置：进门（入口玻璃门 x 0.87–3.06、z 0.87–2.89）后左手边贴墙 (1.75, 0, 3.4)，板面朝厅内（yaw 0，页面镜头从厅内看），
 * 不挡门、不碰 LED 大屏墙（z 0.95–1.57）和前台（x 5.76–7.62、z 3.66–7.53）。坐标是空间米坐标。
 *
 * 只往实体区加两个物件，不动重建层；模型和贴图先用 `metaverse edit upload --file work-upload.json` 上传。
 */
type ModelRecord = { assetHash: string; file: string; bounds: { min: number[]; max: number[] } };
type TextureRecord = { sizeM: number[]; maps: { color: { hash: string; format: string } } };
const MODELS: Record<string, ModelRecord> = JSON.parse(readFileSync(new URL('./models/models.json', import.meta.url), 'utf8')).entities;
const TEXTURES: Record<string, TextureRecord> = JSON.parse(readFileSync(new URL('./textures.json', import.meta.url), 'utf8'));

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export default function build(base: BuildBase, kit: Kit) {
  const { place, placeEntity, box, group, cone, lathe, template, instance, anchor, createAnchor, moveAnchor, toGrid } = kit;
  const board = MODELS['lib-standing_chalkboard_01'];
  const qr = TEXTURES['qr_frontdesk'];
  if (board === undefined || qr === undefined) throw new Error('build/models/models.json 或 build/textures.json 不完整');

  const at: [number, number, number] = [1.65, 0, 3.7]; // 靠着门口的世界地图墙（墙面 x≈1.23），板面朝厅内
  const yaw = 90; // 板面（局部 +z）转向 +x，正对厅内
  const th = (yaw * Math.PI) / 180;
  const { min, max } = board.bounds;
  const corners = [[min[0], min[2]], [max[0], min[2]], [min[0], max[2]], [max[0], max[2]]].map(([x, z]) => [x! * Math.cos(th) + z! * Math.sin(th), -x! * Math.sin(th) + z! * Math.cos(th)]);
  const xs = corners.map((c) => c[0]!), zs = corners.map((c) => c[1]!);
  const link = 'https://t.me/chronoai_frontdesk_bot';
  const text = '扫码进 Telegram 找 ChronoAI 前台：订、改、查、取消 12-17 发布会的虚拟座位，开场前回「入座」就坐上去';

  const chalkboard = {
    entityId: 'frontdesk-board',
    layer: 'ext',
    kind: 'object',
    label: '门口黑板 · 找 AI 前台订座',
    assetHash: board.assetHash,
    material: { shading: 'albedo' },
    transform: { yaw },
    bounds: {
      min: [r6(at[0] + Math.min(...xs)), r6(at[1] + min[1]!), r6(at[2] + Math.min(...zs))],
      max: [r6(at[0] + Math.max(...xs)), r6(at[1] + max[1]!), r6(at[2] + Math.max(...zs))],
    },
    props: { link, 说明: text, source: { library: 'polyhaven', id: 'standing_chalkboard_01', title: 'Standing Chalkboard 01', author: 'James Ray Cock', license: 'CC0-1.0', page: 'https://polyhaven.com/a/standing_chalkboard_01' } },
  };

  // 黑板写字区中心 (0, 0.885, 0.18)、法线 (0, 0.208, 0.978)（上仰 12°，按网格实测）；box 的原点在底面中心，
  // 所以把原点放在二维码下边中点：从板面中心沿板面向下半边长，再沿法线抬起 lift。
  const bn = [0, 0.208, 0.978] as const, bc = [0, 0.885, 0.18] as const, bu = [0, 0.978, -0.208] as const, lift = 0.012, half = 0.35;
  const qrAt = [0, 1, 2].map((i) => r6(bc[i]! - bu[i]! * half + bn[i]! * lift)) as [number, number, number];
  const qrBoard = place('frontdesk-qr', group([
    box([2 * half, 2 * half, 0.008], { at: qrAt, pitch: -12, texture: { hash: qr.maps.color.hash, uv: 'mesh' }, shading: 'albedo', unlit: true }),
  ], { at, yaw }), {
    label: '扫码找 AI 前台订座（Telegram）',
    props: {
      link,
      说明: text,
      background: true,
      landmark: {
        label: '扫码订座 · Telegram',
        position: [r6(at[0] + 0.2), r6(at[1] + 1.55), r6(at[2])],
        focusBounds: { min: [r6(at[0] - 0.3), r6(at[1] + 0.25), r6(at[2] - 0.55)], max: [r6(at[0] + 1.0), r6(at[1] + 1.75), r6(at[2] + 0.55)] },
      },
    },
  });

  // ---------------------------------------------------------------- 花篮位：世界地图墙前两排、每排 6 个
  // 验收原话「送达后花篮带着送花人的署名出现在前厅页面的花篮位」。查看器不能按事件生成模型，所以预置 12 个位置：
  // 每个位置一个锚点 basket-01…12 和一块半透明虚线地垫（空位只有地垫；签收后这个位置亮常驻标签「<署名> 送的<花品>」，
  // 到达动画也落在这个位置）。第一排贴墙（x 1.65），从靠门一头（z 小）往里排，间距 0.7 米；第二排在厅内一侧（x 2.45）。
  // 锚点 basket-stand（整条花篮区，第 17 版建）保留，作为区域。第 17、18 版的台子和花篮模型撤掉。
  const { removeEntity } = kit;
  const removed = ['basket-stand-table', 'basket-stand-basket', 'basket-stand-bloom', 'lobby-bloom-warm']
    .filter((id) => base.entities.some((e) => e.entityId === id))
    .map((id) => removeEntity(id));
  // 虚线地垫：0.6 × 0.6 米的方框，每边 4 段短线，线宽 2.5 厘米、厚 6 毫米，米白半透明
  const dash = (x: number, z: number, along: 'x' | 'z') =>
    box(along === 'x' ? [0.1, 0.006, 0.025] : [0.025, 0.006, 0.1], { at: [x, 0, z], color: '#f3efe6', opacity: 0.55, roughness: 0.9 });
  const matShape = group([
    ...[-0.225, -0.075, 0.075, 0.225].flatMap((t) => [dash(t, -0.3, 'x'), dash(t, 0.3, 'x'), dash(-0.3, t, 'z'), dash(0.3, t, 'z')]),
  ]);
  const templates = new Map([['basket-slot-mat', matShape]]);
  const matTemplate = template('basket-slot-mat', matShape, { label: '花篮位地垫（虚线）' });
  const slots: { id: string; x: number; z: number }[] = [];
  [1.65, 2.45].forEach((x, row) => {
    [4.7, 5.4, 6.1, 6.8, 7.5, 8.2].forEach((z, i) => slots.push({ id: `basket-${String(row * 6 + i + 1).padStart(2, '0')}`, x, z }));
  });
  const mats = slots.map((sl) => place(`${sl.id}-mat`, instance('basket-slot-mat', { at: [sl.x, 0.001, sl.z] }), { templates, label: `花篮位 ${sl.id.slice(-2)}` }));
  const slotAnchors = slots.map((sl) => ({
    ...createAnchor(anchor(sl.id, 'zone', { box: [toGrid(sl.x - 0.3), toGrid(0), toGrid(sl.z - 0.3), toGrid(sl.x + 0.3), toGrid(0.6), toGrid(sl.z + 0.3)] }, { label: `花篮位 ${sl.id.slice(-2)}` })),
    ifNew: true,
  }));

  return {
    message: '前厅门口黑板贴前台 bot 二维码；花篮位改为世界地图墙前两排 12 个虚线地垫（锚点 basket-01…12）',
    ops: [placeEntity(chalkboard as Parameters<typeof placeEntity>[0]), qrBoard, ...removed, placeEntity(matTemplate), ...mats, ...slotAnchors],
  };
}
