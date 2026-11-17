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

  // ---------------------------------------------------------------- 花篮位：前台左侧的小台子，放一只花篮
  // 验收原话「送达后花篮带着送花人的署名出现在前厅页面的花篮位」：花篮位是锚点 basket-stand（世界地图墙前的一溜地板，x 1.25–2.1、z 4.4–9.0），
  // 台上常年摆一只花篮模型；前台签收时往这个锚点写 delivery.arrived（60 秒的到达动画）和 basket.placed（状态标签「<署名> 送的<花品>」，常驻）。
  const basket = MODELS['lib-wicker_basket_02'];
  if (basket === undefined) throw new Error('build/models/models.json 里没有 lib-wicker_basket_02');
  const sx = 1.65, sz = 6.0, standH = 0.9; // 靠世界地图墙，花篮区是墙前这一溜地板
  const stand = place('basket-stand-table', group([
    box([0.5, standH, 0.5], { color: '#d8cdb8', roughness: 0.8 }),
    box([0.56, 0.03, 0.56], { at: [0, standH, 0], color: '#5a3b2a', roughness: 0.6 }),
  ], { at: [sx, 0, sz] }), { label: '花篮位' });
  const bloomShape = group([
    cone(0.16, 0.14, { color: '#4f8f55' }),
    ...['#f2c14e', '#e8743b', '#f9d976', '#e8743b', '#f2c14e', '#fff1c1'].map((c, i) => {
      const a = (i / 6) * Math.PI * 2, rad = i === 0 ? 0 : 0.085, r = 0.055;
      return lathe([[0, 0], [r * 0.7, r * 0.3], [r, r], [r * 0.7, r * 1.7], [0, r * 2]], { at: [Math.cos(a) * rad, i === 0 ? 0.12 : 0.08, Math.sin(a) * rad], color: c });
    }),
  ]);
  const templates = new Map([['lobby-bloom-warm', bloomShape]]);
  const bloomTemplate = template('lobby-bloom-warm', bloomShape, { label: '花团（暖）' });
  const by = standH + 0.03;
  const basketEntity = {
    entityId: 'basket-stand-basket', layer: 'ext', kind: 'object', label: '发布会花篮', assetHash: basket.assetHash, material: { shading: 'albedo' },
    bounds: { min: [r6(sx + basket.bounds.min[0]!), r6(by + basket.bounds.min[1]!), r6(sz + basket.bounds.min[2]!)], max: [r6(sx + basket.bounds.max[0]!), r6(by + basket.bounds.max[1]!), r6(sz + basket.bounds.max[2]!)] },
    props: { source: { library: 'polyhaven', id: 'wicker_basket_02', title: 'Wicker Basket 02', author: 'James Ray Cock', license: 'CC0-1.0', page: 'https://polyhaven.com/a/wicker_basket_02' } },
  };
  const blooms = place('basket-stand-bloom', instance('lobby-bloom-warm', { at: [sx + 0.03, by + 0.18, sz] }), { templates, label: '花' });
  const standBox = [toGrid(1.25), toGrid(0), toGrid(4.4), toGrid(2.1), toGrid(1.5), toGrid(9.0)];
  // 锚点已经存在（第 17 版）时只挪盒子；还没有时新建。
  const hasStandAnchor = base.anchors.some((a) => a.anchorId === 'basket-stand');
  const standAnchor = hasStandAnchor ? moveAnchor('basket-stand', { box: standBox }) : createAnchor(anchor('basket-stand', 'zone', { box: standBox }, { label: '花篮位' }));

  return {
    message: '前厅门口加黑板：贴发布会前台 Telegram bot 的二维码，页面上可点「扫码订座 · Telegram」；前台左侧加花篮位（锚点 basket-stand）',
    ops: [placeEntity(chalkboard as Parameters<typeof placeEntity>[0]), qrBoard, stand, placeEntity(basketEntity as Parameters<typeof placeEntity>[0]), placeEntity(bloomTemplate), blooms, standAnchor],
  };
}
