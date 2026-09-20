import { it,expect } from 'vitest';
import { Parser,Language,Node } from 'web-tree-sitter';
import { readdir,readFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { prepareSwiftGrammar } from '../scripts/swift-grammar';

// Portable grammar check only: this does not typecheck Apple SDKs or replace xcodebuild.
it('所有 Swift 源码通过跨平台语法解析（不等于 Xcode 编译）',async()=>{
  await Parser.init({locateFile:(file:string)=>resolve('node_modules/web-tree-sitter',file)});
  const parser=new Parser();parser.setLanguage(await Language.load(resolve('node_modules/@repomix/tree-sitter-wasms/out/tree-sitter-swift.wasm')));
  const files: string[]=[];
  async function walk(dir:string) {for(const entry of await readdir(dir,{withFileTypes:true})) {const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else if(path.endsWith('.swift'))files.push(path);}}
  for(const dir of ['Sources','Tests','UITests'])await walk(`apps/ios/${dir}`);
  const errors:string[]=[];
  for(const file of files) {
    const tree=parser.parse(prepareSwiftGrammar(await readFile(file,'utf8')))!;
    function inspect(node:Node) {if(node.type==='ERROR'||node.isMissing)errors.push(`${file}:${node.startPosition.row+1}: ${node.type} ${node.text.slice(0,150)}`);else if(node.hasError)node.children.forEach(child=>{if(child)inspect(child);});}
    inspect(tree.rootNode);tree.delete();
  }
  const broken=parser.parse('struct Broken { var value: Int = }')!;
  expect(broken.rootNode.hasError).toBe(true);broken.delete();
  parser.delete();expect(files.length).toBeGreaterThan(20);expect(errors).toEqual([]);
});
it.each(['\n','\r\n'])('Swift 条件编译检查保留所有分支并拒绝不匹配指令（换行 %j）',(newline)=>{
  const source=['#if DEBUG','let a = 1','#else','let b = 2','#endif'].join(newline);
  const prepared=prepareSwiftGrammar(source);
  expect(prepared).toContain('let a = 1');expect(prepared).toContain('let b = 2');
  expect(prepared).not.toContain('#if');expect(prepared).not.toContain('#endif');
  expect(prepared.split('\n')).toHaveLength(source.split('\n').length);
  expect(()=>prepareSwiftGrammar('#if DEBUG\nlet a=1')).toThrow('Unclosed');
  expect(()=>prepareSwiftGrammar('#else')).toThrow('Invalid');
  expect(()=>prepareSwiftGrammar('#if DEBUG\n#else\n#else\n#endif')).toThrow('Invalid');
});
