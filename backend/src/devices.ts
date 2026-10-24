import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

/** Persistiert gekoppelte Geräte (nur SHA-256-Hashes der Tokens) in einer JSON-Datei. */
export class DeviceStore {
  private hashes = new Set<string>();
  private file: string;
  private writing: Promise<void> = Promise.resolve();

  constructor(private dir: string) {
    this.file = join(dir, 'devices.json');
  }

  async load(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      const j = JSON.parse(await readFile(this.file, 'utf8'));
      for (const d of j.devices ?? []) if (typeof d.hash === 'string') this.hashes.add(d.hash);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }

  has(token: string): boolean {
    return this.hashes.has(sha(token));
  }

  async add(token: string): Promise<void> {
    this.hashes.add(sha(token));
    this.writing = this.writing.then(() => this.persist());
    await this.writing;
  }

  private async persist(): Promise<void> {
    const devices = [...this.hashes].map((hash) => ({ hash }));
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify({ devices }, null, 2), { mode: 0o600 });
    await rename(tmp, this.file);
  }
}
