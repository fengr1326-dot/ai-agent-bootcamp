import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { Repository, DomainError } from './repository';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
export class Auth {
  private key: Uint8Array;
  constructor(private repo: Repository, secret: string, private appleAudience?: string) {
    if (secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters');
    this.key = new TextEncoder().encode(secret);
  }
  async issue(id: string, create = false) {
    const refresh = `${id}.${randomBytes(32).toString('base64url')}`;
    const accessToken = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(id).setIssuer('meal-rhythm').setAudience('meal-rhythm-api').setIssuedAt().setExpirationTime('15m').sign(this.key);
    await this.repo.transact(id, state => { state.refreshHashes = [...state.refreshHashes.slice(-4), digest(refresh)]; }, create);
    return { accessToken, refreshToken: refresh, expiresIn: 900, userId: id };
  }
  async guest() { return this.issue(randomUUID(), true); }
  async apple(identityToken: string, nonce: string) {
    if (!this.appleAudience) throw new DomainError(503, 'APPLE_NOT_CONFIGURED', '尚未配置 Apple 登录');
    let payload;
    try { ({ payload } = await jwtVerify(identityToken, appleKeys, { issuer: 'https://appleid.apple.com', audience: this.appleAudience, algorithms: ['RS256'] })); }
    catch { throw new DomainError(401, 'APPLE_TOKEN_INVALID', 'Apple 登录凭据无效'); }
    if (!payload.sub || payload.nonce !== digest(nonce)) throw new DomainError(401, 'APPLE_NONCE_INVALID', 'Apple 登录验证失败');
    return this.issue(`apple-${digest(payload.sub)}`, true);
  }
  async refresh(token: string) {
    const id = token.split('.')[0];
    await this.repo.transact(id, state => {
      const hash = digest(token);
      if (!state.refreshHashes.includes(hash)) throw new DomainError(401, 'REFRESH_INVALID', '请重新登录');
      state.refreshHashes = state.refreshHashes.filter(h => h !== hash);
    });
    return this.issue(id);
  }
  async identify(header: string | undefined): Promise<string> {
    if (!header?.startsWith('Bearer ')) throw new DomainError(401, 'UNAUTHORIZED', '请先登录');
    try {
      const { payload } = await jwtVerify(header.slice(7), this.key, { algorithms: ['HS256'], issuer: 'meal-rhythm', audience: 'meal-rhythm-api' });
      if (!payload.sub || !await this.repo.read(payload.sub)) throw new Error('Account absent');
      return payload.sub;
    } catch { throw new DomainError(401, 'UNAUTHORIZED', '登录已失效，请重新登录'); }
  }
}
