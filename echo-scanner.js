import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { parseEchoScanBatch } from './echo-inventory.js';

const run = promisify(execFile);
const source = join(import.meta.dirname, 'macos/echo-scanner.swift');
const buildDirectory = join(import.meta.dirname, '.build');
const binary = join(buildDirectory, 'macos-echo-scanner');
let scanning = false;

export async function echoScannerStatus() {
  requireMacOS();
  await ensureScanner();
  return runScanner(['--check']);
}

export async function scanMacEchoes(limit = 0) {
  requireMacOS();
  if (!Number.isInteger(limit) || limit < 0 || limit > 2000) throw new Error('扫描数量必须是 1–2000，或留空自动识别');
  if (scanning) throw new Error('已有一次声骸扫描正在进行');
  scanning = true;
  try {
    await ensureScanner();
    const diagnostics = join(buildDirectory, 'echo-scan-failures');
    await mkdir(diagnostics, { recursive: true });
    return parseEchoScanBatch(await runScanner(['--limit', String(limit), '--diagnostics', diagnostics]));
  } finally { scanning = false; }
}

async function ensureScanner() {
  await mkdir(join(buildDirectory, 'module-cache'), { recursive: true });
  const [sourceInfo, binaryInfo] = await Promise.all([stat(source), stat(binary).catch(() => null)]);
  if (binaryInfo?.mtimeMs >= sourceInfo.mtimeMs) return;
  try {
    await run('swiftc', ['-parse-as-library', '-module-cache-path', join(buildDirectory, 'module-cache'), source, '-o', binary,
      '-framework', 'AppKit', '-framework', 'Vision', '-framework', 'ScreenCaptureKit'], { timeout: 120_000, maxBuffer: 4_000_000 });
  } catch (error) {
    throw new Error(`macOS 扫描器编译失败：${error.stderr?.trim() || error.message}`);
  }
}

async function runScanner(arguments_) {
  try {
    const { stdout } = await run(binary, arguments_, { timeout: 30 * 60_000, maxBuffer: 30_000_000 });
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(error.stderr?.trim() || '声骸扫描失败');
  }
}

function requireMacOS() {
  if (process.platform !== 'darwin') throw new Error('自动声骸扫描目前只支持 macOS');
}
