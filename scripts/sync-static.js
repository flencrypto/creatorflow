import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(moduleFilename);
const rootDirectory = path.resolve(moduleDirectory, '..');
const sourceDirectory = path.join(rootDirectory, 'public');
const destinationDirectory = path.join(rootDirectory, 'docs');

async function assertSourceDirectory() {
  try {
    const stats = await fs.stat(sourceDirectory);
    if (!stats.isDirectory()) {
      throw new Error(`Expected public directory at ${sourceDirectory}`);
    }
  } catch (error) {
    throw new Error(`Cannot sync static assets because public directory is missing: ${error.message}`);
  }
}

async function cleanDestination() {
  await fs.rm(destinationDirectory, { recursive: true, force: true });
  await fs.mkdir(destinationDirectory, { recursive: true });
}

async function copyPublicToDocs() {
  await fs.cp(sourceDirectory, destinationDirectory, { recursive: true });
}

async function main() {
  await assertSourceDirectory();
  await cleanDestination();
  await copyPublicToDocs();
  console.log(`Synced static assets from ${sourceDirectory} to ${destinationDirectory}`);
}

main().catch((error) => {
  console.error('[sync-static] Failed to copy public assets into docs:', error);
  process.exitCode = 1;
});
