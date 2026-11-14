#!/usr/bin/env node
// 订花流程：把一单的三条事件写进元宇宙（设计 5.3、11、12 节）。
//
//   node scripts/order.mjs place  --order <编号> --item <花品>   顾客专员接单：花店收银台写 order.placed
//   node scripts/order.mjs send   --order <编号> --item <花品>   店主专员开始配送：花店收银台写 delivery.sent（路线起点）
//   node scripts/order.mjs arrive --order <编号> --item <花品>   店主专员确认送达：前厅收货台写 delivery.arrived（路线终点）
//   node scripts/order.mjs status 营业中|已打烊                   店主专员改营业状态：空间级 shop.status
//
// 选项：
//   --from <送花人>        送花人的署名（来宾自己起的昵称，不写电话），显示在前厅的送达标签上
//   --at <RFC 3339>        现实发生时间，默认现在（晚于服务端 5 分钟以上会被拒收）
//   --dry-run              只打印要发的路径和请求体，不发送；同时按 event-types/ 里的 schema 检查 data
//   --source <数据源>       数据源，默认 florist（key 的操作范围只放开这个数据源）
//   --lobby <空间编号>      前厅空间，默认 chronoai-lobby；--lobby-anchor <锚点> 收货台，默认 counter-01
//   --json                 结果输出 JSON
//
// 鉴权和地址读本目录的 metaverse.json，再按命令行和环境变量覆盖（与 metaverse 命令行一致）：
//   nyxid 模式（线上）：--token / NYXID_TOKEN / NYXID_TOKEN_FILE / --profile（nyxid login --agent-key 存的令牌）；
//     arrive 写的是前厅空间，用前厅组织发给花店的那把 key：--lobby-profile / --lobby-token / LOBBY_NYXID_TOKEN；
//   direct 模式（本地联调）：--api、--dev-token-url、--sub（或 METAVERSE_API_URL、METAVERSE_DEV_TOKEN_URL、METAVERSE_DEV_SUB）。
//
// 去重靠 sourceEventId（<订单编号>.placed / .sent / .arrived），同一单重复运行不会写第二条；
// send 和 arrive 用同一个 correlationId = <花店空间编号>:<订单编号>，查看器据此把起点和终点连成路线。

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ApiClient, ApiError, resolveNyxToken } from '../../../sdk/typescript/dist/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const STEPS = {
  place: { type: 'order.placed', suffix: 'placed', where: 'shop', correlated: false },
  send: { type: 'delivery.sent', suffix: 'sent', where: 'shop', correlated: true },
  arrive: { type: 'delivery.arrived', suffix: 'arrived', where: 'lobby', correlated: true },
};
const ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

function usage(message) {
  if (message) console.error(message);
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(2);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    order: { type: 'string' }, item: { type: 'string' }, from: { type: 'string' }, at: { type: 'string' },
    'dry-run': { type: 'boolean', default: false }, json: { type: 'boolean', default: false },
    source: { type: 'string', default: 'florist' },
    lobby: { type: 'string', default: 'chronoai-lobby' }, 'lobby-anchor': { type: 'string', default: 'counter-01' },
    token: { type: 'string' }, profile: { type: 'string' }, 'lobby-token': { type: 'string' }, 'lobby-profile': { type: 'string' },
    mode: { type: 'string' }, slug: { type: 'string' }, 'nyx-base': { type: 'string' },
    api: { type: 'string' }, 'dev-token-url': { type: 'string' }, sub: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});
if (values.help || positionals.length === 0) usage();
const [command, statusText] = positionals;
const config = JSON.parse(readFileSync(join(root, 'metaverse.json'), 'utf8'));
const shopId = config.spaceId;
const mode = values.mode ?? config.mode ?? 'nyxid';
const env = process.env;

/** 按 event-types/<空间>/<类型>.json 的 schema 检查 data（只认这些文件用到的几种规则）。 */
function checkData(spaceDir, type, data) {
  const dir = join(root, 'event-types', spaceDir);
  const file = readdirSync(dir).find((name) => name === `${type}.json`);
  if (!file) throw new Error(`event-types/${spaceDir}/ 里没有 ${type}.json`);
  const schema = JSON.parse(readFileSync(join(dir, file), 'utf8')).schema;
  for (const key of schema.required ?? []) if (!(key in data)) throw new Error(`${type}：缺少 ${key}`);
  for (const [key, value] of Object.entries(data)) {
    const rule = schema.properties?.[key];
    if (!rule) { if (schema.additionalProperties === false) throw new Error(`${type}：不允许的字段 ${key}`); continue; }
    if (rule.type === 'string' && typeof value !== 'string') throw new Error(`${type}：${key} 必须是字符串`);
    if (rule.maxLength !== undefined && value.length > rule.maxLength) throw new Error(`${type}：${key} 超过 ${rule.maxLength} 个字符`);
    if (rule.enum && !rule.enum.includes(value)) throw new Error(`${type}：${key} 只能是 ${rule.enum.join('、')}`);
  }
  return JSON.stringify(data).length <= 4096;
}

/** 组装这次要写的事件：{ spaceId, path, body }。 */
function buildRequest() {
  const at = values.at ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(at))) usage(`--at 不是 RFC 3339 时间：${at}`);
  if (command === 'status') {
    if (!statusText) usage('status 后面要写 营业中 或 已打烊');
    const data = { status: statusText };
    checkData(shopId, 'shop.status', data);
    const sourceEventId = `status.${at.replace(/[^0-9A-Za-z]/g, '').slice(0, 20)}`;
    return { spaceId: shopId, anchorId: '_space', event: { sourceEventId, type: 'shop.status', anchorId: '_space', at, data } };
  }
  const step = STEPS[command];
  if (!step) usage(`不认识的命令：${command}`);
  if (!values.order || !ORDER_ID.test(values.order)) usage('--order 要写订单编号（字母、数字、- 和 _，最多 32 个字符）');
  if (!values.item) usage('--item 要写花品（例如 发布会花篮）');
  const spaceId = step.where === 'shop' ? shopId : values.lobby;
  const anchorId = step.where === 'shop' ? 'counter' : values['lobby-anchor'];
  const data = { item: values.item, orderId: values.order, ...(values.from ? { from: values.from } : {}) };
  checkData(spaceId, step.type, data);
  const event = { sourceEventId: `${values.order}.${step.suffix}`, type: step.type, anchorId, at, data };
  if (step.correlated) event.correlationId = `${shopId}:${values.order}`;
  return { spaceId, anchorId, event };
}

/** 接口客户端：花店空间用花店的 key，前厅空间用前厅发的 key。 */
function client(spaceId) {
  if (mode === 'direct') {
    const api = values.api ?? config.api ?? env.METAVERSE_API_URL;
    const devTokenUrl = values['dev-token-url'] ?? config.devTokenUrl ?? env.METAVERSE_DEV_TOKEN_URL;
    const devSub = values.sub ?? config.devSub ?? env.METAVERSE_DEV_SUB;
    return new ApiClient({ mode: 'direct', api, devTokenUrl, ...(devSub ? { devSub } : {}) });
  }
  const lobby = spaceId !== shopId;
  const resolved = resolveNyxToken({
    ...(lobby ? { token: values['lobby-token'] ?? env.LOBBY_NYXID_TOKEN, profile: values['lobby-profile'] } : { token: values.token, profile: values.profile ?? config.profile }),
    env,
  });
  console.error(`${lobby ? '前厅' : '花店'}的令牌：${resolved.source}`);
  return new ApiClient({ mode: 'nyxid', slug: values.slug ?? config.slug, ...(values['nyx-base'] ?? config.nyxBase ? { nyxBase: values['nyx-base'] ?? config.nyxBase } : {}), token: () => resolved.token });
}

let spaceId, event;
try { ({ spaceId, event } = buildRequest()); } catch (error) { console.error(error.message); process.exit(2); }
const path = `/api/v1/spaces/${encodeURIComponent(spaceId)}/sources/${encodeURIComponent(values.source)}/events`;
const body = { events: [event] };
if (values['dry-run']) {
  console.log(values.json ? JSON.stringify({ method: 'POST', path, body }, null, 2) : `POST ${path}\n${JSON.stringify(body, null, 2)}`);
  process.exit(0);
}
try {
  const result = await client(spaceId).json('POST', path, { json: body });
  const first = result.results?.[0];
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`${first?.status === 'duplicate' ? '已存在（没有重复写）' : '已写入'}：${event.type} @ ${spaceId}/${event.anchorId}，事件编号 ${first?.id ?? '?'}，记录时间 ${result.recordedAt}`);
} catch (error) {
  if (error instanceof ApiError) { console.error(error.message); process.exit(1); }
  throw error;
}
