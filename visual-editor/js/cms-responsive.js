/* Shared presentation contract. Legacy maps remain an immutable responsive base;
   edits live in one exact-device override and never enter another device's base. */
(() => {
  'use strict';
  const devices = ['desktop','tablet','mobile'];
  const media = {desktop:'(min-width:1024.01px)',tablet:'(min-width:767.01px) and (max-width:1024px)',mobile:'(max-width:767px)'};
  const presentationKeys = ['columns','cardStyle','imageRatio','showPrice','showSalePrice','showCart','showBadge'];
  function mergeEffects(base, next = {}) {
    return {...base,...next,...(next.position?{position:{...base.position,...next.position}}:{}),...(next.gradient?{gradient:{...base.gradient,...next.gradient}}:{})};
  }
  function resolve(item = {}, device = 'desktop') {
    let styles={},effects={};
    for(const key of devices.slice(0,devices.indexOf(device)+1)){
      Object.assign(styles,item.styles?.[key]||{});effects=mergeEffects(effects,item.effects?.[key]);
    }
    const override=item.overrides?.[device]||{};
    return {styles:{...styles,...override.styles},effects:mergeEffects(effects,override.effects),hidden:override.hidden??!!item.hidden,content:{...item.content,...override.content},hover:{...item.hover,...override.hover},animation:{...item.animation,...override.animation}};
  }
  function override(item,device) {
    if(!devices.includes(device))throw new TypeError('Choose a supported device.');
    item.overrides??={};return item.overrides[device]??={};
  }
  function styles(item,device){const value=override(item,device);return value.styles??={};}
  function effect(item,device,key){const inherited=resolve(item,device).effects[key];const value=override(item,device);value.effects??={};return value.effects[key]??={...(key==='gradient'?{enabled:false,start:'#7c3aed',end:'#ec4899',angle:90}:{}),...inherited};}
  function hideEverywhere(item){item.hidden=true;for(const value of Object.values(item.overrides||{}))delete value.hidden;}
  const api=Object.freeze({devices,media,presentationKeys,resolve,override,styles,effect,hideEverywhere});
  (typeof window==='undefined'?globalThis:window).CMResponsive=api;
})();
