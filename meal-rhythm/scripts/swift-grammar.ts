/** Tree-sitter cannot parse conditional compilation inside SwiftUI result builders.
 * Validate directive nesting, then parse ALL branch bodies with line numbers intact.
 * Conditions are evaluated only by Xcode, not by this portable grammar check.
 */
export function prepareSwiftGrammar(source:string):string {
  const stack:{hasElse:boolean}[]=[];
  const result=source.split(/\r?\n/).map((line,index)=>{
    const directive=line.match(/^\s*#(if|elseif|else|endif)\b(.*)$/);
    if(!directive)return line;
    const [,kind,tail]=directive;
    const fail=()=>{throw new Error(`Invalid Swift compilation directive at line ${index+1}`);};
    if(kind==='if') {if(!tail.trim())fail();stack.push({hasElse:false});}
    else if(!stack.length)fail();
    else if(kind==='endif')stack.pop();
    else if(stack.at(-1)!.hasElse)fail();
    else if(kind==='else')stack.at(-1)!.hasElse=true;
    else if(!tail.trim())fail();
    return ' '.repeat(line.length);
  }).join('\n');
  if(stack.length)throw new Error('Unclosed Swift compilation directive');
  return result;
}
