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
  // Additional page-level patches can go here
}

function getStealthScript(fingerprint?: Fingerprint): string {
  const fp = fingerprint || getDefaultFingerprint();

  return `(function(){
    'use strict';
    
    // ========== WEBDRIVER DETECTION ==========
    // Multiple methods to hide webdriver
    Object.defineProperty(navigator,'webdriver',{get:()=>false,configurable:true});
    
    // Delete from prototype chain
    try {
      const proto = Object.getPrototypeOf(navigator);
      if (proto.hasOwnProperty('webdriver')) {
        delete proto.webdriver;
      }
    } catch(e){}
    
    // Override property descriptor
    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        get: () => false,
        configurable: true
      });
    } catch(e){}
    
    // ========== AUTOMATION FLAGS ==========
    const automationProps = [
      'cdc_adoQpoasnfa76pfcZLmcfl_Array',
      'cdc_adoQpoasnfa76pfcZLmcfl_Promise', 
      'cdc_adoQpoasnfa76pfcZLmcfl_Symbol',
      '__webdriver_script_fn',
      '__driver_evaluate',
      '__webdriver_evaluate',
      '__selenium_evaluate',
      '__fxdriver_evaluate',
      '__driver_unwrapped',
      '__webdriver_unwrapped',
      '__selenium_unwrapped',
      '__fxdriver_unwrapped',
      '_Selenium_IDE_Recorder',
      '_selenium',
      'calledSelenium',
      '$cdc_asdjflasutopfhvcZLmcfl_',
      '$chrome_asyncScriptInfo',
      '__$webdriverAsyncExecutor',
      '__lastWatirAlert',
      '__lastWatirConfirm',
      '__lastWatirPrompt',
      'webdriver',
      '_WEBDRIVER_ELEM_CACHE',
      'ChromeDriverw',
      'driver-evaluate',
      'webdriver-evaluate',
      'selenium-evaluate',
      'webdriverCommand',
      'webdriver-evaluate-response',
      '__nightmare',
      '__phantomas',
      'callPhantom',
      '_phantom',
      'phantom',
      'domAutomation',
      'domAutomationController'
    ];
    
    for (const prop of automationProps) {
      try {
        if (prop in window) delete window[prop];
        Object.defineProperty(window, prop, { get: () => undefined, configurable: true });
      } catch(e) {}
    }
    
    // ========== CHROME OBJECT ==========
    if (!window.chrome) {
      window.chrome = {};
    }
    
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        id: undefined,
        connect: function(extensionId, connectInfo) {
          return {
            name: '',
            disconnect: function() {},
            onDisconnect: { addListener: function() {} },
            onMessage: { addListener: function() {} },
            postMessage: function() {},
            sender: undefined
          };
        },
        sendMessage: function(extensionId, message, options, callback) {
          if (typeof options === 'function') { callback = options; }
          if (typeof callback === 'function') { callback(undefined); }
        },
        onConnect: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
        onMessage: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
        onInstalled: { addListener: function() {} },
        getManifest: function() { return {}; },
        getURL: function(path) { return ''; },
        getPlatformInfo: function(callback) {
          if (typeof callback === 'function') {
            callback({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' });
          }
        }
      };
    }
    
    window.chrome.csi = function() { return { onloadT: Date.now(), pageT: Date.now() + 100, startE: Date.now() - 500, tran: 15 }; };
    window.chrome.loadTimes = function() { 
      return { 
        commitLoadTime: Date.now() / 1000, 
        connectionInfo: 'h2',
        finishDocumentLoadTime: Date.now() / 1000 + 0.1,
        finishLoadTime: Date.now() / 1000 + 0.2,
        firstPaintAfterLoadTime: 0,
        firstPaintTime: Date.now() / 1000 + 0.05,
        navigationType: 'Other',
        npnNegotiatedProtocol: 'h2',
        requestTime: Date.now() / 1000 - 0.1,
        startLoadTime: Date.now() / 1000 - 0.05,
        wasAlternateProtocolAvailable: false,
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true
      }; 
    };
    
    if (!window.chrome.webstore) {
      window.chrome.webstore = {
        onInstallStageChanged: { addListener: function() {} },
        onDownloadProgress: { addListener: function() {} },
        install: function(url, onSuccess, onFailure) {
          if (typeof onFailure === 'function') onFailure('User cancelled');
        }
      };
    }
    
    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function() { return null; },
        getIsInstalled: function() { return false; },
        runningState: function() { return 'cannot_run'; }
      };
    }
    
    // ========== PLUGINS (FIX PluginArray TYPE) ==========
    const pluginData = [
      { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer', mimeTypes: [{ type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
      { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: '' }] },
      { name: 'Native Client', description: '', filename: 'internal-nacl-plugin', mimeTypes: [{ type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' }] }
    ];
    
    // Create proper PluginArray
    const pluginArray = Object.create(PluginArray.prototype);
    const mimeTypeArray = Object.create(MimeTypeArray.prototype);
    const mimeTypes = [];
    
    pluginData.forEach((p, idx) => {
      const plugin = Object.create(Plugin.prototype);
      const pluginMimeTypes = [];
      
      p.mimeTypes.forEach((mt, mtIdx) => {
        const mimeType = Object.create(MimeType.prototype);
        Object.defineProperties(mimeType, {
          type: { value: mt.type, enumerable: true },
          suffixes: { value: mt.suffixes, enumerable: true },
          description: { value: mt.description, enumerable: true },
          enabledPlugin: { value: plugin, enumerable: true }
        });
        pluginMimeTypes.push(mimeType);
        mimeTypes.push(mimeType);
      });
      
      Object.defineProperties(plugin, {
        name: { value: p.name, enumerable: true },
        description: { value: p.description, enumerable: true },
        filename: { value: p.filename, enumerable: true },
        length: { value: pluginMimeTypes.length, enumerable: true }
      });
      
      pluginMimeTypes.forEach((mt, i) => {
        Object.defineProperty(plugin, i, { value: mt, enumerable: true });
        Object.defineProperty(plugin, mt.type, { value: mt, enumerable: false });
      });
      
      plugin.item = function(i) { return pluginMimeTypes[i] || null; };
      plugin.namedItem = function(name) { return pluginMimeTypes.find(m => m.type === name) || null; };
      
      Object.defineProperty(pluginArray, idx, { value: plugin, enumerable: true });
      Object.defineProperty(pluginArray, p.name, { value: plugin, enumerable: false });
    });
    
    Object.defineProperty(pluginArray, 'length', { value: pluginData.length, enumerable: true });
    pluginArray.item = function(i) { return this[i] || null; };
    pluginArray.namedItem = function(name) { return this[name] || null; };
    pluginArray.refresh = function() {};
    
    mimeTypes.forEach((mt, i) => {
      Object.defineProperty(mimeTypeArray, i, { value: mt, enumerable: true });
      Object.defineProperty(mimeTypeArray, mt.type, { value: mt, enumerable: false });
    });
    Object.defineProperty(mimeTypeArray, 'length', { value: mimeTypes.length, enumerable: true });
    mimeTypeArray.item = function(i) { return this[i] || null; };
    mimeTypeArray.namedItem = function(name) { return this[name] || null; };
    
    Object.defineProperty(navigator, 'plugins', { get: () => pluginArray, configurable: true });
    Object.defineProperty(navigator, 'mimeTypes', { get: () => mimeTypeArray, configurable: true });
    
    // ========== HARDWARE PROPERTIES ==========
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fp.hardwareConcurrency}, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => ${fp.deviceMemory}, configurable: true });
    Object.defineProperty(navigator, 'platform', { get: () => '${fp.platform}', configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0, configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => Object.freeze(['en-US', 'en']), configurable: true });
    Object.defineProperty(navigator, 'language', { get: () => 'en-US', configurable: true });
    Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.', configurable: true });
    Object.defineProperty(navigator, 'productSub', { get: () => '20030107', configurable: true });
    
    // ========== WEBGL ==========
    const webglHandler = {
      apply: function(target, thisArg, args) {
        const param = args[0];
        if (param === 37445) return '${fp.webgl.vendor}'; // UNMASKED_VENDOR_WEBGL
        if (param === 37446) return '${fp.webgl.renderer}'; // UNMASKED_RENDERER_WEBGL
        return Reflect.apply(target, thisArg, args);
      }
    };
    
    try {
      WebGLRenderingContext.prototype.getParameter = new Proxy(WebGLRenderingContext.prototype.getParameter, webglHandler);
      if (typeof WebGL2RenderingContext !== 'undefined') {
        WebGL2RenderingContext.prototype.getParameter = new Proxy(WebGL2RenderingContext.prototype.getParameter, webglHandler);
      }
    } catch(e) {}
    
    // ========== CANVAS FINGERPRINT PROTECTION ==========
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    
    const addNoise = (imageData) => {
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (Math.random() < 0.05) {
          imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + (Math.random() > 0.5 ? 1 : -1)));
        }
      }
      return imageData;
    };
    
    HTMLCanvasElement.prototype.toDataURL = function() {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          const imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
          addNoise(imageData);
          ctx.putImageData(imageData, 0, 0);
        } catch(e) {}
      }
      return origToDataURL.apply(this, arguments);
    };
    
    // ========== BATTERY API ==========
    if (navigator.getBattery) {
      navigator.getBattery = () => Promise.resolve({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 0.95 + Math.random() * 0.05,
        addEventListener: function() {},
        removeEventListener: function() {},
        dispatchEvent: function() { return true; }
      });
    }
    
    // ========== PERMISSIONS API ==========
    const origQuery = navigator.permissions?.query;
    if (origQuery) {
      navigator.permissions.query = function(descriptor) {
        if (descriptor.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, onchange: null });
        }
        return origQuery.call(navigator.permissions, descriptor);
      };
    }
    
    // ========== IFRAME PROTECTION ==========
    const origContentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (origContentWindow && origContentWindow.get) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        get: function() {
          const win = origContentWindow.get.call(this);
          try {
            if (win && win.navigator) {
              Object.defineProperty(win.navigator, 'webdriver', { get: () => false });
            }
          } catch(e) {}
          return win;
        }
      });
    }
    
    // ========== FUNCTION TO STRING ==========
    const origToString = Function.prototype.toString;
    const patchedFunctions = new WeakSet();
    
    Function.prototype.toString = function() {
      if (patchedFunctions.has(this)) {
        return 'function ' + (this.name || '') + '() { [native code] }';
      }
      return origToString.call(this);
    };
    
    // Mark our patched functions
    if (navigator.permissions?.query) patchedFunctions.add(navigator.permissions.query);
    if (navigator.getBattery) patchedFunctions.add(navigator.getBattery);
    
    // ========== ERROR STACK CLEANING ==========
    const origError = Error;
    window.Error = function(...args) {
      const error = new origError(...args);
      if (error.stack) {
        error.stack = error.stack
          .split('\\n')
          .filter(line => !/(puppeteer|playwright|selenium|webdriver|chromedriver)/i.test(line))
          .join('\\n');
      }
      return error;
    };
    window.Error.prototype = origError.prototype;
    
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
