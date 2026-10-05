import { Buffer } from 'buffer';

// TON's cell library uses Buffer while building the invoice comment.
// Install it before the lazy checkout module is evaluated in a browser.
const runtime = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
runtime.Buffer ??= Buffer;
