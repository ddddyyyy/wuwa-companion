import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const convenePattern = /https:\/\/aki-gm-resources(?:-oversea)?\.aki-game\.(?:net|com)\/aki\/gacha\/index\.html#\/record[^"\s]*/g;

export function trackerPlatform(platform = process.platform) {
  return platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux';
}

export function extractConveneURL(bytes) {
  const findLast = text => text.match(convenePattern)?.at(-1);
  const raw = findLast(Buffer.from(bytes).toString('utf8'));
  if (raw) return raw;
  const decoded = Buffer.from(bytes);
  for (let index = 0; index < decoded.length; index += 1) {
    decoded[index] ^= (decoded[index] & 0x0f) % 2 === 1 ? 0xa5 : 0xef;
  }
  return findLast(decoded.toString('utf8'));
}

export function candidateLogPaths(platform = process.platform, home = homedir()) {
  const logs = root => [
    join(root, 'Client', 'Saved', 'Logs', 'Client.log'),
    join(root, 'Client', 'Binaries', 'Win64', 'ThirdParty', 'KrPcSdk_Global', 'KRSDKRes', 'KRSDKWebView', 'debug.log')
  ];
  if (platform === 'darwin') {
    return ['com.kurogame.wutheringwaves.global', 'com.kurogame.mingchao', 'com.kurogame.WutheringWaves']
      .map(bundle => join(home, 'Library', 'Containers', bundle, 'Data', 'Library', 'Logs', 'Client', 'Client.log'));
  }
  if (platform === 'win32') {
    const roots = [];
    for (const drive of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      roots.push(
        `${drive}:\\Wuthering Waves Game`,
        `${drive}:\\Wuthering Waves\\Wuthering Waves Game`,
        `${drive}:\\Games\\Wuthering Waves Game`,
        `${drive}:\\Program Files\\Wuthering Waves\\Wuthering Waves Game`,
        `${drive}:\\SteamLibrary\\steamapps\\common\\Wuthering Waves\\Wuthering Waves Game`,
        `${drive}:\\Program Files (x86)\\Steam\\steamapps\\common\\Wuthering Waves\\Wuthering Waves Game`,
        `${drive}:\\Program Files\\Epic Games\\WutheringWavesj3oFh\\Wuthering Waves Game`
      );
    }
    return [...new Set(roots.flatMap(logs))];
  }
  return [
    join(home, '.steam', 'steam', 'steamapps', 'common', 'Wuthering Waves', 'Wuthering Waves Game'),
    join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'Wuthering Waves', 'Wuthering Waves Game')
  ].flatMap(logs);
}

export async function findConveneLink(platform = process.platform) {
  const found = (await Promise.all(candidateLogPaths(platform).map(async path => {
    try { return { path, modified: (await stat(path)).mtimeMs }; } catch { return null; }
  }))).filter(Boolean).sort((a, b) => b.modified - a.modified);
  for (const file of found) {
    const url = extractConveneURL(await readFile(file.path));
    if (url) return { platform: trackerPlatform(platform), url };
  }
  throw new Error('没有找到抽卡链接。请先启动鸣潮并打开一次“唤取记录”，然后重试。');
}
