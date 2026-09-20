import { readFile } from 'node:fs/promises';
import { describe,it,expect } from 'vitest';
import { openapiDocument,routes } from '../packages/contracts/routes';
import { mobileFixtures } from '../packages/contracts/fixtures';
import { responseSchemas } from '../packages/contracts/responses';

describe('iOS 与 API 契约一致性',()=>{
  it('除规范文档自身外，每个接口都具有明确响应模型',()=>{
    for(const route of routes) if(route.operation!=='openapi') expect(responseSchemas[route.operation],route.operation).toBeDefined();
  });
  it('真实业务响应匹配公开响应模型',async()=>{
    for(const [name,envelope] of Object.entries(await mobileFixtures())) if(name!=='recognition') expect(responseSchemas[name].safeParse(envelope.data).success,name).toBe(true);
  });
  it('提交的 OpenAPI 与运行中的定义完全一致',async()=>{
    expect(JSON.parse(await readFile('packages/contracts/generated/openapi.json','utf8'))).toEqual(openapiDocument());
  });
  it('每个 API 在 Swift 绑定中具有相同路径、方法和权限',async()=>{
    const source=await readFile('apps/ios/Sources/Generated/APIOperation.swift','utf8');
    for(const route of routes) {
      expect(source.replace(/\r\n/g,'\n')).toContain(`case ${route.operation}\n`);
      expect(source).toContain(`case .${route.operation}: return ${JSON.stringify(route.path)}`);
      expect(source).toContain(`case .${route.operation}: return ${JSON.stringify(route.method)}`);
      expect(source).toContain(`case .${route.operation}: return ${'public' in route ? 'true':'false'}`);
    }
  });
  it('Swift 解码使用的测试样本由真实业务逻辑生成且没有过期',async()=>{
    const expected=await mobileFixtures();
    for(const [name,body] of Object.entries(expected)) expect(JSON.parse(await readFile(`apps/ios/Tests/Fixtures/${name}.json`,'utf8'))).toEqual(body);
  });
  it('移动端样本覆盖餐次区间、可选训练时间和下一餐候选',async()=>{
    const {day}=await mobileFixtures();const data=day.data as any;
    expect(data.recommendations).toHaveLength(3);expect(data.context.trainingAt).toBeNull();
    expect(data.nutrition.consumed.energy.max).toBeGreaterThan(data.nutrition.consumed.energy.min);
    expect(data.safety.message).toBeNull();expect(data.meals[0].status).toBe('eaten');
  });
});
