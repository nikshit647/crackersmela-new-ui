import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import vm from 'node:vm';

const root = new URL('../visual-editor/js/', import.meta.url);
function runtime() {
  const context = vm.createContext({window:{}, document:{}, URL});
  const helper = new URL('cms-responsive.js', root);
  if (existsSync(helper)) vm.runInContext(readFileSync(helper,'utf8'),context);
  // Expose the real CSS generator only within this test VM; shipped code has no test hooks.
  const source = readFileSync(new URL('cms-runtime.js',root),'utf8').replace('window.CMCms =', 'window.testRules = rulesFor; window.CMCms =');
  vm.runInContext(source,context);
  return context.window;
}
function stylesAt(css,width) {
  const result={};
  function scan(text,active=true) {
    let cursor=0;
    while(cursor<text.length){
      const open=text.indexOf('{',cursor);if(open<0)break;
      const header=text.slice(cursor,open).trim();let end=open+1,depth=1;
      while(depth&&end<text.length){if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}
      const body=text.slice(open+1,end-1);cursor=end;
      if(header.startsWith('@media')){
        const min=/min-width\s*:\s*([\d.]+)px/.exec(header),max=/max-width\s*:\s*([\d.]+)px/.exec(header);
        scan(body,active&&(!min||width>=Number(min[1]))&&(!max||width<=Number(max[1]))&&!/hover|prefers-reduced-motion/.test(header));
      }else if(active&&header==='.subject'){
        for(const part of body.split(';')){const colon=part.indexOf(':');if(colon>0)result[part.slice(0,colon)]=part.slice(colon+1).replace(/!important$/,'');}
      }
    }
  }
  scan(css);return result;
}
test('new Desktop overrides leave inherited Tablet and Mobile legacy appearance unchanged',()=>{
  const api=runtime(),item={kind:'text',styles:{desktop:{fontSize:'40px',paddingTop:'18px'},tablet:{fontSize:'32px'},mobile:{}},overrides:{desktop:{styles:{fontSize:'56px',paddingTop:'30px'}}}};
  const css=api.testRules('.subject',item);
  assert.equal(stylesAt(css,1280)['font-size'],'56px');
  assert.equal(stylesAt(css,1024)['font-size'],'32px');
  assert.equal(stylesAt(css,390)['font-size'],'32px');
  assert.equal(stylesAt(css,390)['padding-top'],'18px');
});
test('new Tablet styles and position do not cascade into Mobile',()=>{
  const api=runtime(),item={kind:'image',styles:{desktop:{width:'300px'},mobile:{width:'180px'}},effects:{desktop:{position:{x:10,y:20,scale:1}}},overrides:{tablet:{styles:{width:'250px'},effects:{position:{x:30,y:40,scale:1.2}}}}};
  const css=api.testRules('.subject',item);
  assert.equal(stylesAt(css,768).width,'250px');
  assert.equal(stylesAt(css,768).translate,'30px 40px');
  assert.equal(stylesAt(css,390).width,'180px');
  assert.equal(stylesAt(css,390).translate,'10px 20px');
  assert.equal(stylesAt(css,1280).width,'300px');
});
test('device visibility can reveal a legacy hidden section without revealing other sizes',()=>{
  const api=runtime(),item={hidden:true,styles:{},overrides:{mobile:{hidden:false}}};
  const css=api.testRules('.subject',item);
  assert.equal(stylesAt(css,1280).display,'none');
  assert.equal(stylesAt(css,768).display,'none');
  assert.equal(stylesAt(css,390).display,undefined);
});
test('an unedited native breakpoint is left to the original responsive stylesheet',()=>{
  const api=runtime(),item={styles:{},overrides:{desktop:{styles:{fontSize:'60px',display:'grid'}}}};
  const css=api.testRules('.subject',item);
  assert.equal(stylesAt(css,1280)['font-size'],'60px');
  assert.deepEqual(stylesAt(css,390),{});
  assert.deepEqual(stylesAt(css,768),{});
});
test('deleting shared content hides it even where a device explicitly showed it',()=>{
  const api=runtime(),item={hidden:false,styles:{desktop:{fontSize:'40px'}},overrides:{mobile:{hidden:false,styles:{fontSize:'20px'}}}};
  assert.equal(typeof api.CMResponsive.hideEverywhere,'function');
  api.CMResponsive.hideEverywhere(item);
  const css=api.testRules('.subject',item);
  for(const width of [1280,768,390])assert.equal(stylesAt(css,width).display,'none');
  assert.equal(stylesAt(css,390)['font-size'],'20px');
});
