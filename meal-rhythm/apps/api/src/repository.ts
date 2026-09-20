import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AccountState, initialState } from '../../../packages/domain/models';

export interface Repository {
  read(id: string): Promise<AccountState | null>;
  transact<T>(id: string, fn: (state: AccountState) => Promise<T> | T, create?: boolean): Promise<T>;
  delete(id: string): Promise<void>;
  ids(): Promise<string[]>;
  close(): Promise<void>;
}
export class DomainError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export class LocalRepository implements Repository {
  private tails = new Map<string, Promise<unknown>>();
  private memory = new Map<string, AccountState>();
  constructor(private directory?: string) {}
  private file(id: string) { return join(this.directory!, `${createHash('sha256').update(id).digest('hex')}.json`); }
  async read(id: string): Promise<AccountState | null> {
    if (!this.directory) return structuredClone(this.memory.get(id) ?? null);
    try { return JSON.parse(await readFile(this.file(id), 'utf8')).state; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  private async exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(id) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(work);
    this.tails.set(id, pending);
    try { return await pending; } finally { if (this.tails.get(id) === pending) this.tails.delete(id); }
  }
  async transact<T>(id: string, fn: (state: AccountState) => Promise<T> | T, create = false): Promise<T> {
    return this.exclusive(id, async () => {
      let state = await this.read(id);
      if (!state && !create) throw new DomainError(401, 'ACCOUNT_UNAVAILABLE', '账号已删除或会话失效');
      state ??= initialState();
      const result = await fn(state);
      if (this.directory) {
        await mkdir(this.directory, { recursive: true });
        const target = this.file(id), temp = target + '.tmp';
        await writeFile(temp, JSON.stringify({ id, state }), { mode: 0o600 });
        await rename(temp, target);
      } else this.memory.set(id, structuredClone(state));
      return structuredClone(result);
    });
  }
  async delete(id: string) {
    await this.exclusive(id, async () => {
      if (this.directory) await unlink(this.file(id)).catch(e => { if (e.code !== 'ENOENT') throw e; });
      this.memory.delete(id);
    });
  }
  async ids(): Promise<string[]> {
    if (!this.directory) return [...this.memory.keys()];
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(this.directory).catch(() => []);
    return Promise.all(files.filter(f => f.endsWith('.json')).map(async f => JSON.parse(await readFile(join(this.directory!, f), 'utf8')).id));
  }
  async close() {}
}

// One JSON aggregate per account keeps meal, intake, reminder and idempotency writes atomic.
// Typed child tables can replace this adapter without changing the HTTP contract.
export class PostgresRepository implements Repository {
  constructor(private prisma: any) {}
  async read(id: string) { const row = await this.prisma.account.findUnique({ where: { id } }); return row?.state as AccountState ?? null; }
  async transact<T>(id: string, fn: (s: AccountState) => Promise<T> | T, create = false): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx: any) => {
          const row = await tx.account.findUnique({ where: { id } });
          if (!row && !create) throw new DomainError(401, 'ACCOUNT_UNAVAILABLE', '账号已删除或会话失效');
          const state = (row?.state ?? initialState()) as AccountState;
          const result = await fn(state);
          // Existing accounts must only UPDATE. An UPSERT could resurrect a row deleted
          // after our snapshot was read, restoring private data after account deletion.
          if(row) await tx.account.update({ where: { id }, data: { state } });
          else await tx.account.create({ data: { id, state } });
          return result;
        }, { isolationLevel: 'Serializable', timeout: 10000 });
      } catch (e: any) {
        if(e.code==='P2025') throw new DomainError(401,'ACCOUNT_UNAVAILABLE','账号已删除或会话失效');
        if (!['P2034', 'P2002'].includes(e.code) || attempt === 4) throw e;
      }
    }
    throw new Error('Transaction retry exhausted');
  }
  async delete(id: string) { await this.prisma.account.deleteMany({ where: { id } }); }
  async ids() { return (await this.prisma.account.findMany({ select: { id: true } })).map((x: any) => x.id); }
  async close() { await this.prisma.$disconnect(); }
}
