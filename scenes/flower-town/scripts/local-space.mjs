// 不连服务器时，按 layout.json 写出一个空的基础状态（space.json 等），让 build、check、dev、shot 能在本地跑。
// 线上建好空间后请改用 `metaverse pull`，它会用真实状态覆盖这些文件。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(join(root, 'metaverse.json'), 'utf8'));
const layout = JSON.parse(readFileSync(join(root, 'layout.json'), 'utf8'));
const spaceFile = join(root, 'space.json');
if (existsSync(spaceFile) && !process.argv.includes('--force')) {
  const current = JSON.parse(readFileSync(spaceFile, 'utf8'));
  if (current.pulledAt) {
    console.error('space.json 是从线上拉取的，不覆盖；要重写本地空状态请加 --force。');
    process.exit(1);
  }
}
const write = (name, value) => writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`);
write('space.json', {
  spaceId: config.spaceId,
  name: '街角花店',
  description: '本地空状态：按 layout.json 生成，未从线上拉取。',
  visibility: 'unlisted',
  seq: 0,
  at: new Date(0).toISOString(),
  regions: layout.regions,
  plots: layout.plots,
});
write('palette.json', { blocks: [] });
write('anchors.json', []);
write('entities.json', []);
console.log(`已写出本地空状态：空间 ${config.spaceId}，${layout.regions.length} 个区域、${layout.plots.length} 个地块。`);
