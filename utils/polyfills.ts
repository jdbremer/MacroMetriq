// utils/polyfills.ts
import { encode as _btoa, decode as _atob } from 'base-64';

// one canonical global
const g: any = (typeof globalThis !== 'undefined' ? globalThis : global) as any;

// ensure aliases all exist and point to the same object
if (typeof g.global === 'undefined') g.global = g;
if (typeof g.window === 'undefined') g.window = g;
if (typeof g.self === 'undefined')   g.self   = g;

// atob / btoa on all aliases
[g, g.window, g.self, g.global].forEach((t: any) => {
  if (typeof t.atob === 'undefined') t.atob = _atob;
  if (typeof t.btoa === 'undefined') t.btoa = _btoa;
  if (typeof t.Base64 === 'undefined') t.Base64 = { encode: _btoa, decode: _atob };
});

// OPTIONAL: only if you ever see TextEncoder/TextDecoder errors
try {
  if (typeof g.TextEncoder === 'undefined' || typeof g.TextDecoder === 'undefined') {
    const { TextEncoder, TextDecoder } = require('fast-text-encoding');
    g.TextEncoder = TextEncoder;
    g.TextDecoder = TextDecoder;
  }
} catch {}
