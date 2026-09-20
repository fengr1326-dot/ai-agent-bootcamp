import { it,expect } from 'vitest';
import { readFile,access } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';

it('启动说明和实施状态的本地链接均能找到对应文件',async()=>{
  for(const file of ['README.md','docs/implementation-status.md','docs/testing.md']) {
    const content=await readFile(file,'utf8');expect(content.length).toBeGreaterThan(500);
    for(const match of content.matchAll(/\]\(([^)]+)\)/g)) if(!/^https?:/.test(match[1])) await access(resolve(dirname(file),match[1]));
  }
});
it('发布边界、尚未验证项和自动删除限制在交付文档中明确标注',async()=>{
  const status=await readFile('docs/implementation-status.md','utf8');
  for(const required of ['尚未在 Xcode 编译','没有创建或启用自动照片清理任务','NODE_ENV=production','真实视觉 API','APNs'])expect(status).toContain(required);
});
