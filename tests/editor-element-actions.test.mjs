import test from 'node:test';
import assert from 'node:assert/strict';
import { canReplaceText, removeElement, insertImage } from '../audit-evidence/product-experience-20261010/source/js/cms-element-actions.js';
import { History, clone, responsive } from '../audit-evidence/product-experience-20261010/source/js/cms-model.js';

const section = () => ({ id:'home:hero', type:'native', elements:{
  eroot:{kind:'container'}, e0:{kind:'container'},
  'e0.1':{kind:'text',text:'Original heading',styles:{desktop:{width:'400px',fontSize:'58px'},mobile:{width:'240px'}},effects:{desktop:{position:{x:12,y:8,scale:1}}},overrides:{tablet:{hidden:false,styles:{width:'300px',color:'#123456'},effects:{position:{x:4,y:2,scale:1}}},mobile:{hidden:false,styles:{width:'220px'}}}},
  'e0.2':{kind:'text',text:'Other copy',styles:{desktop:{fontSize:'18px'}}}
}});

test('delete removes only the selected element on all devices and Undo restores exact content and style',()=>{
  const sec=section(), before=clone(sec), history=new History();
  history.commit(before); assert.equal(removeElement(sec,'e0.1'),true);
  for(const device of responsive.devices) assert.equal(responsive.resolve(sec.elements['e0.1'],device).hidden,true);
  assert.equal(sec.elements['e0.1'].text,'Original heading');
  assert.deepEqual(sec.elements['e0.2'],before.elements['e0.2']);
  assert.deepEqual(history.undo(sec),before);
  assert.equal(removeElement(sec,null),false); assert.equal(removeElement(sec,'eroot'),false); assert.equal(removeElement(sec,'missing'),false);
});

test('replace inserts a separate image beside its stable original and preserves device-specific position and width',()=>{
  const sec=section(), before=clone(sec);
  const id=insertImage(sec,{elementId:'e0.1',parentId:'e0',beforeId:'e0.1',replace:true},{url:'/uploads/test.png',alt:'Uploaded artwork'},'a-image');
  assert.equal(id,'a-image'); const image=sec.elements[id];
  assert.equal(image.kind,'image'); assert.equal(image.parentId,'e0'); assert.equal(image.beforeId,'e0.1');
  assert.equal(image.src,'/uploads/test.png'); assert.equal(image.alt,'Uploaded artwork');
  assert.equal(sec.elements['e0.1'].text,'Original heading');
  for(const device of responsive.devices){
    assert.equal(responsive.resolve(sec.elements['e0.1'],device).hidden,true);
    assert.equal(responsive.resolve(image,device).hidden,false);
    assert.equal(responsive.resolve(image,device).styles.width,responsive.resolve(before.elements['e0.1'],device).styles.width);
    assert.deepEqual(responsive.resolve(image,device).effects.position,responsive.resolve(before.elements['e0.1'],device).effects.position);
  }
  assert.equal(image.styles.desktop.fontSize,undefined); assert.equal(image.overrides.tablet.styles.color,undefined);
  assert.deepEqual(sec.elements['e0.2'],before.elements['e0.2']);
});

test('Add image keeps selected copy intact, while stale or protected replacements do not change the document',()=>{
  const sec=section(), original=clone(sec.elements['e0.1']);
  assert.equal(insertImage(sec,{elementId:'e0.1',parentId:'e0',beforeId:'e0.1'},{url:'/images/test.png'},'a-added'),'a-added');
  assert.deepEqual(sec.elements['e0.1'],original);
  const before=clone(sec);
  assert.equal(insertImage(sec,{elementId:'missing',replace:true},{url:'/images/test.png'},'a-stale'),false);
  assert.equal(insertImage(sec,{elementId:'e0.1',replace:true,readOnlyText:true},{url:'/images/test.png'},'a-protected'),false);
  assert.equal(insertImage(sec,{elementId:'e0.1',replace:true},{url:''},'a-empty'),false);
  assert.deepEqual(sec,before);
  assert.equal(canReplaceText({kind:'button'}),false); assert.equal(canReplaceText({kind:'container'}),false);
});
