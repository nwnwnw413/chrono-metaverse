#!/usr/bin/env node
// 在本地全套上把订花流程从头跑一遍（infra/dev/up.sh 先起好；要重跑就先停掉、删库再起：
//   infra/dev/down.sh && node infra/dev/mongo.mjs drop 27017 chrono_metaverse_dev && infra/dev/up.sh）：
//
//   1. alice（模拟 NyxID 里 chronoai 组织的 admin）建花店空间 flower-town 和前厅替身 chronoai-lobby；
//   2. 两个空间各定地块（layout.json、local/lobby-stand-in/layout.json）；
//   3. 登记事件类型（event-types/）；
//   4. 前厅替身：一张前台和公开锚点 counter-01（local/lobby-stand-in/build/main.ts），推草稿、发布；
//   5. 花店：拉取 → 上传核对模型和贴图 → 建造 → 检查 → 推草稿 → 发布；
//   6. 建组合「街角」，两个空间加入，花店的 door 连到前厅的 counter-01；
//   7. 用 scripts/order.mjs 写营业状态和一单的三条事件（direct 模式，身份是组织本身 chronoai）；
//   8. 打印查看链接。
//
// 用法：node scripts/local-demo.mjs [--api http://127.0.0.1:8080] [--nyx http://127.0.0.1:8090] [--web http://127.0.0.1:5173]
// 只改本地全套里的数据；工作区里被 pull 覆盖的 space.json 等文件不进版本库。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const scene = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(dirname(scene));
const { values } = parseArgs({ options: { api: { type: 'string', default: 'http://127.0.0.1:8080' }, nyx: { type: 'string', default: 'http://127.0.0.1:8090' }, web: { type: 'string', default: 'http://127.0.0.1:5173' } } });
const cli = join(repo, 'sdk', 'typescript', 'dist', 'cli.js');
const env = { ...process.env, METAVERSE_API_URL: values.api, MOCK_NYXID_URL: values.nyx };
const LOBBY = 'chronoai-lobby', SHOP = 'flower-town', UNIVERSE = 'street-corner', ORG = 'chronoai';
const lobbyDir = join(scene, 'local', 'lobby-stand-in');

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { cwd: options.cwd ?? scene, env, encoding: 'utf8', input: options.input });
  if (r.status !== 0 && !options.allowFail) {
    console.error(`${[cmd, ...args].join(' ')}\n${r.stdout}${r.stderr}`);
    process.exit(1);
  }
  return r;
}
/** 调接口：call.mjs 第一行是状态，后面是 JSON。 */
function call(as, method, path, body) {
  const args = [join(repo, 'infra', 'dev', 'call.mjs'), '--as', as, method, path];
  if (body !== undefined) args.push(JSON.stringify(body));
  const r = run('node', args, { allowFail: true });
  const text = r.stdout.trim();
  const status = Number((/^(\d{3}) /m.exec(r.stderr) ?? [])[1] ?? 0); // call.mjs 把状态行打在 stderr
  const json = text.startsWith('{') ? JSON.parse(text) : null;
  return { status, json, raw: `${r.stderr}${text}` };
}
function must(result, what, ...okStatuses) {
  if (!okStatuses.includes(result.status)) { console.error(`${what} 失败：\n${result.raw}`); process.exit(1); }
  return result.json;
}
const direct = (sub) => ['--mode', 'direct', '--api', values.api, '--dev-token-url', `${values.nyx}/dev/token`, '--sub', sub];
const metaverse = (cwd, sub, ...args) => run('node', [cli, ...args, ...direct(sub)], { cwd });
const step = (n, text) => console.log(`\n[${n}] ${text}`);

step(1, '建空间');
const tokens = {};
for (const [id, name, description] of [[SHOP, '街角花店', '本地联调'], [LOBBY, 'ChronoAI 前厅（替身）', '只有前台和收货台锚点，代替线上前厅做联调']]) {
  const created = call('alice', 'POST', '/api/v1/admin/spaces', { id, name, description, owner: { kind: 'org', id: ORG } });
  if (created.status === 409) { console.error(`空间 ${id} 已存在：这个脚本要在空库上跑，先删库再起全套`); process.exit(1); }
  tokens[id] = must(created, `建空间 ${id}`, 201).shareToken.token;
  console.log(`  ${id} 建好，分享令牌 ${tokens[id]}`);
}

step(2, '定地块');
for (const [id, file] of [[SHOP, join(scene, 'layout.json')], [LOBBY, join(lobbyDir, 'layout.json')]]) {
  const head = must(call('alice', 'GET', `/api/v1/spaces/${id}`), `读 ${id}`, 200).head.seq;
  const layout = JSON.parse(readFileSync(file, 'utf8'));
  must(call('alice', 'PUT', `/api/v1/admin/spaces/${id}/layout`, { ...layout, baseSeq: head, message: '划出地块' }), `${id} 定地块`, 200);
  console.log(`  ${id}：${layout.plots.map((p) => p.id).join('、')}`);
}

step(3, '登记事件类型');
for (const [space, types] of [[SHOP, ['order.placed', 'delivery.sent', 'shop.status']], [LOBBY, ['delivery.arrived']]]) {
  for (const type of types) {
    const body = JSON.parse(readFileSync(join(scene, 'event-types', space, `${type}.json`), 'utf8'));
    must(call('alice', 'POST', `/api/v1/admin/spaces/${space}/event-types`, body), `${space} 登记 ${type}`, 201);
    console.log(`  ${space}：${type}`);
  }
}

/** 推草稿并发布：返回发布后的 seq。 */
function pushAndPublish(cwd, plot, extra = []) {
  const pushed = JSON.parse(metaverse(cwd, 'alice', 'push', '--plot', plot, '--no-preview', '--json', ...extra).stdout);
  const draftId = pushed.draftId ?? pushed.draft?.draftId;
  if (!draftId) { console.error(`push 没有返回草稿编号：${JSON.stringify(pushed).slice(0, 300)}`); process.exit(1); }
  const published = JSON.parse(metaverse(cwd, 'alice', 'publish', draftId, '--json').stdout);
  return published.seq;
}

step(4, '前厅替身：前台和收货台锚点');
metaverse(scene, 'alice', 'init', LOBBY, lobbyDir, '--plot', 'hall', '--web-url', values.web, '--force');
metaverse(lobbyDir, 'alice', 'pull');
metaverse(lobbyDir, 'alice', 'build');
metaverse(lobbyDir, 'alice', 'check');
console.log(`  发布为 seq ${pushAndPublish(lobbyDir, 'hall', ['--inline'])}`);

step(5, '花店：上传核对模型和贴图，建造、检查、推草稿、发布');
metaverse(scene, 'alice', 'pull');
const models = JSON.parse(readFileSync(join(scene, 'build', 'models', 'models.json'), 'utf8'));
const textures = JSON.parse(readFileSync(join(scene, 'build', 'textures.json'), 'utf8'));
const assets = new Map();
for (const hash of Object.keys(models.files)) assets.set(hash, { hash, format: 'glb' });
for (const texture of Object.values(textures)) for (const map of Object.values(texture.maps)) assets.set(map.hash, { hash: map.hash, format: 'jpg' });
for (const asset of assets.values()) if (!existsSync(join(scene, 'assets', `${asset.hash}.${asset.format}`))) { console.error(`缺少 assets/${asset.hash}.${asset.format}：先按 README 取模型和贴图`); process.exit(1); }
mkdirSync(join(scene, 'work'), { recursive: true });
writeFileSync(join(scene, 'work', 'edit.json'), JSON.stringify({ version: 1, message: '上传花店的模型和贴图', ops: [], assets: [...assets.values()] }, null, 1));
const uploaded = JSON.parse(metaverse(scene, 'alice', 'edit', 'upload', '--file', 'work/edit.json', '--plot', 'shop', '--json').stdout);
console.log(`  资源核对通过：${uploaded.uploaded ?? assets.size} 个`);
metaverse(scene, 'alice', 'build');
metaverse(scene, 'alice', 'check');
console.log(`  发布为 seq ${pushAndPublish(scene, 'shop')}`);

step(6, '组合「街角」');
const universe = must(call('alice', 'POST', '/api/v1/universes', { id: UNIVERSE, name: '街角', owner: { kind: 'org', id: ORG }, visibility: 'unlisted' }), '建组合', 201);
tokens[UNIVERSE] = universe.shareToken.token;
must(call('alice', 'POST', `/api/v1/universes/${UNIVERSE}/members/${LOBBY}`, { offset: [0, 0, 0], rotation: 0, message: '前厅加入' }), '前厅加入', 200);
must(call('alice', 'POST', `/api/v1/universes/${UNIVERSE}/members/${SHOP}`, { offset: [240, 0, 20], rotation: 0, message: '花店放在前厅东侧' }), '花店加入', 200);
must(call('alice', 'PATCH', `/api/v1/universes/${UNIVERSE}`, { message: '花店门口连到前厅前台', links: [{ from: { spaceId: SHOP, anchorId: 'door' }, to: { spaceId: LOBBY, anchorId: 'counter-01' }, kind: 'door' }] }), '连接', 200);
console.log('  两个空间已加入，door → counter-01 已连接');

step(7, '订花：营业状态和一单的三条事件（身份：组织本身 chronoai）');
const order = (...args) => console.log(`  ${run('node', [join(scene, 'scripts', 'order.mjs'), ...args, ...direct(ORG)]).stdout.trim()}`);
order('status', '营业中');
order('place', '--order', 'demo-0001', '--item', '发布会花篮');
order('send', '--order', 'demo-0001', '--item', '发布会花篮', '--at', new Date(Date.now() - 60_000).toISOString());
order('arrive', '--order', 'demo-0001', '--item', '发布会花篮');

step(8, '看结果（送达后的路线显示 60 秒，想再看一次就再跑一单）');
console.log(`  组合：${values.web}/u/${UNIVERSE}#share=${tokens[UNIVERSE]}\n  花店：${values.web}/s/${SHOP}#share=${tokens[SHOP]}\n  前厅替身：${values.web}/s/${LOBBY}#share=${tokens[LOBBY]}`);
console.log(`  再跑一单：node scripts/order.mjs send --order demo-0002 --item 粉玫瑰一桶 ${direct(ORG).join(' ')} && node scripts/order.mjs arrive --order demo-0002 --item 粉玫瑰一桶 ${direct(ORG).join(' ')}`);
