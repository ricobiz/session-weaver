/**
 * Advanced Stealth & Anti-Detection Module
 * Patches browser to bypass modern bot detection systems
 */

import { Page, BrowserContext } from 'playwright';
import { Fingerprint } from './fingerprint';
import { log } from '../logger';

/**
 * Apply all stealth patches to a browser context
 */
export async function applyStealthPatches(
  context: BrowserContext,
  fingerprint?: Fingerprint
): Promise<void> {
  log('debug', 'Applying advanced stealth patches');
  await context.addInitScript(getStealthScript(fingerprint));
}

/**
 * Apply page-level patches after navigation
 */
export async function applyPagePatches(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
}

function getStealthScript(fingerprint?: Fingerprint): string {
  const fp = fingerprint || getDefaultFingerprint();

  return `(function(){
    'use strict';
    
    // WebDriver
    Object.defineProperty(navigator,'webdriver',{get:()=>undefined,configurable:true});
    try{delete Object.getPrototypeOf(navigator).webdriver}catch(e){}
    
    // Remove automation props
    ['cdc_adoQpoasnfa76pfcZLmcfl_Array','cdc_adoQpoasnfa76pfcZLmcfl_Promise','__webdriver_script_fn'].forEach(p=>{
      try{delete window[p];Object.defineProperty(window,p,{get:()=>undefined})}catch(e){}
    });
    
    // Chrome object
    if(!window.chrome)window.chrome={};
    window.chrome.runtime={id:undefined,connect:()=>({postMessage:()=>{},onMessage:{addListener:()=>{}}}),sendMessage:()=>{},onMessage:{addListener:()=>{}}};
    window.chrome.csi=()=>({});
    window.chrome.loadTimes=()=>({});
    
    // Hardware
    Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>${fp.hardwareConcurrency}});
    Object.defineProperty(navigator,'deviceMemory',{get:()=>${fp.deviceMemory}});
    Object.defineProperty(navigator,'platform',{get:()=>'${fp.platform}'});
    Object.defineProperty(navigator,'maxTouchPoints',{get:()=>0});
    Object.defineProperty(navigator,'languages',{get:()=>Object.freeze(['en-US','en'])});
    
    // Plugins
    Object.defineProperty(navigator,'plugins',{get:()=>{
      const arr=[{name:'Chrome PDF Plugin',filename:'internal-pdf-viewer'},{name:'Chrome PDF Viewer',filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai'},{name:'Native Client',filename:'internal-nacl-plugin'}];
      arr.item=(i)=>arr[i]||null;arr.namedItem=(n)=>arr.find(p=>p.name===n)||null;arr.refresh=()=>{};
      return arr;
    }});
    
    // WebGL
    try{
      const h={apply:(t,a,args)=>{if(args[0]===37445)return '${fp.webgl.vendor}';if(args[0]===37446)return '${fp.webgl.renderer}';return Reflect.apply(t,a,args)}};
      WebGLRenderingContext.prototype.getParameter=new Proxy(WebGLRenderingContext.prototype.getParameter,h);
      if(typeof WebGL2RenderingContext!=='undefined')WebGL2RenderingContext.prototype.getParameter=new Proxy(WebGL2RenderingContext.prototype.getParameter,h);
    }catch(e){}
    
    // Canvas noise
    const origToDataURL=HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL=function(){
      const ctx=this.getContext('2d');
      if(ctx&&this.width>0){try{const d=ctx.getImageData(0,0,this.width,this.height);for(let i=0;i<d.data.length;i+=4)if(Math.random()<0.1){d.data[i]+=Math.random()>0.5?1:-1}ctx.putImageData(d,0,0)}catch(e){}}
      return origToDataURL.apply(this,arguments);
    };
    
    // Battery
    if(navigator.getBattery)navigator.getBattery=()=>Promise.resolve({charging:true,level:1,chargingTime:0,dischargingTime:Infinity,addEventListener:()=>{}});
    
    // Permissions
    const origQuery=navigator.permissions?.query;
    if(origQuery){navigator.permissions.query=(p)=>p.name==='notifications'?Promise.resolve({state:Notification.permission}):origQuery.call(navigator.permissions,p)}
    
    // Iframe protection
    const origCW=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentWindow');
    if(origCW)Object.defineProperty(HTMLIFrameElement.prototype,'contentWindow',{get:function(){const w=origCW.get.call(this);try{if(w&&w.navigator)Object.defineProperty(w.navigator,'webdriver',{get:()=>undefined})}catch(e){}return w}});
  })();`;
}

function getDefaultFingerprint(): Fingerprint {
  return {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
    },
    screen: { width: 1920, height: 1080, colorDepth: 24, pixelRatio: 1 },
  };
}

export { Fingerprint } from './fingerprint';
