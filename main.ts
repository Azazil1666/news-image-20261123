// THE WORLD LEDGER — MONDAY 23 NOVEMBER 2026
// Pure Node.js newspaper front page renderer
// 1024x1024 PNG, deterministic, no dependencies

import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// CONSTANTS & PALETTE
// ============================================================================
const W = 1024;
const H = 1024;
const PIXELS = W * H * 3;

const COLORS = {
  paper:  [0xf2, 0xed, 0xe3],  // #f2ede3
  ink:    [0x1e, 0x2a, 0x32],  // #1e2a32
  teal:   [0x24, 0x42, 0x4e],  // #24424e
  red:    [0xb3, 0x40, 0x2e],  // #b3402e
  green:  [0x7f, 0xa0, 0x8a],  // #7fa08a
  brown:  [0x6b, 0x4a, 0x2f],  // #6b4a2f
  light:  [0xdc, 0xe8, 0xe4],  // #dce8e4
  white:  [0xff, 0xff, 0xff],
  black:  [0x00, 0x00, 0x00],
} as const;

type Color = [number, number, number];

// ============================================================================
// PIXEL BUFFER
// ============================================================================
const buf = new Uint8Array(PIXELS);

function setPixel(x: number, y: number, c: Color): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: Color): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      setPixel(xx, yy, c);
    }
  }
}

function drawLine(x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = (dx > dy ? dx : -dy) / 2;
  let x = x0, y = y0;
  while (true) {
    setPixel(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = err;
    if (e2 > -dx) { err -= dy; x += sx; }
    if (e2 < dy) { err += dx; y += sy; }
  }
}

// ============================================================================
// 5x7 BITMAP FONT (defined manually)
// Each glyph: 7 rows of 5 bits (1 = ink)
// Order: space, ! " # $ % & ' ( ) * + , - . / 0-9 : ; < = > ? @ A-Z [ \ ] ^ _ ` a-z { | } ~
// We only need: A-Z, 0-9, . , : ; ' " - / % $ ( ) & ! ? space
// ============================================================================
const GLYPHS: Record<string, number[]> = {
  ' ': [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0],
  '!': [0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,0,0,0,0, 0,1,0,0,0],
  '"': [0,1,0,1,0, 0,1,0,1,0, 0,1,0,1,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0],
  '#': [0,0,0,0,0, 1,0,1,0,1, 1,0,1,0,1, 0,1,1,1,0, 1,0,1,0,1, 1,0,1,0,1, 0,0,0,0,0],
  '$': [0,0,1,0,0, 0,1,1,1,0, 1,1,0,1,1, 0,0,1,0,0, 1,1,0,1,1, 0,1,1,1,0, 0,0,1,0,0],
  '%': [1,1,0,0,0, 1,1,0,0,1, 0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 1,0,0,1,1, 0,0,0,1,1],
  '&': [0,1,1,0,0, 1,0,0,1,0, 1,0,0,1,0, 0,1,1,0,0, 1,0,0,1,0, 1,0,0,1,0, 0,1,1,0,0],
  "'": [0,1,0,0,0, 0,1,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0],
  '(': [0,0,1,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,0,1,0,0],
  ')': [0,0,1,0,0, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0, 0,0,1,0,0],
  '*': [0,0,0,0,0, 0,1,0,1,0, 0,0,1,0,0, 1,1,1,1,1, 0,0,1,0,0, 0,1,0,1,0, 0,0,0,0,0],
  '+': [0,0,0,0,0, 0,0,1,0,0, 0,0,1,0,0, 1,1,1,1,1, 0,0,1,0,0, 0,0,1,0,0, 0,0,0,0,0],
  ',': [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0],
  '-': [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 1,1,1,1,1, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0],
  '.': [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,1,0,0,0, 0,1,0,0,0],
  '/': [0,0,0,0,1, 0,0,0,0,1, 0,0,0,1,0, 0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 1,0,0,0,0],
  '0': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,1,1, 1,0,1,0,1, 1,1,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '1': [0,0,1,0,0, 0,1,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,1,1,1,0],
  '2': [0,1,1,1,0, 1,0,0,0,1, 0,0,0,0,1, 0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 1,1,1,1,1],
  '3': [0,1,1,1,0, 1,0,0,0,1, 0,0,0,0,1, 0,0,1,1,0, 0,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '4': [0,0,0,1,0, 0,0,1,1,0, 0,1,0,1,0, 1,0,0,1,0, 1,1,1,1,1, 0,0,0,1,0, 0,0,0,1,0],
  '5': [1,1,1,1,1, 1,0,0,0,0, 1,1,1,1,0, 0,0,0,0,1, 0,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '6': [0,0,1,1,0, 0,1,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '7': [1,1,1,1,1, 0,0,0,0,1, 0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0],
  '8': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '9': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,1, 0,0,0,0,1, 0,0,0,1,0, 0,1,1,0,0],
  ':': [0,0,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,0,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,0,0,0,0],
  ';': [0,0,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,0,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0],
  '<': [0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0],
  '=': [0,0,0,0,0, 0,0,0,0,0, 1,1,1,1,1, 0,0,0,0,0, 1,1,1,1,1, 0,0,0,0,0, 0,0,0,0,0],
  '>': [0,0,1,0,0, 0,1,0,0,0, 1,0,0,0,0, 0,0,0,1,0, 1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0],
  '?': [0,1,1,1,0, 1,0,0,0,1, 0,0,0,1,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,0,0,0, 0,0,1,0,0],
  '@': [0,1,1,1,0, 1,0,0,0,1, 1,0,1,1,1, 1,0,1,0,1, 1,0,1,0,0, 1,0,0,0,1, 0,1,1,1,0],
  'A': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1],
  'B': [1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0],
  'C': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,1, 0,1,1,1,0],
  'D': [1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0],
  'E': [1,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,1],
  'F': [1,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0],
  'G': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,0, 1,0,1,1,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'H': [1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1],
  'I': [1,1,1,1,1, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 1,1,1,1,1],
  'J': [0,0,1,1,1, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0, 1,0,0,1,0, 0,1,1,0,0],
  'K': [1,0,0,0,1, 1,0,0,1,0, 1,0,1,0,0, 1,1,0,0,0, 1,0,1,0,0, 1,0,0,1,0, 1,0,0,0,1],
  'L': [1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,1],
  'M': [1,0,0,0,1, 1,1,0,1,1, 1,0,1,0,1, 1,0,1,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1],
  'N': [1,0,0,0,1, 1,1,0,0,1, 1,0,1,0,1, 1,0,1,0,1, 1,0,0,1,1, 1,0,0,0,1, 1,0,0,0,1],
  'O': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'P': [1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0],
  'Q': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,1,0,1, 1,0,0,1,0, 0,1,1,0,1],
  'R': [1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0, 1,0,1,0,0, 1,0,0,1,0, 1,0,0,0,1],
  'S': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,0, 0,1,1,1,0, 0,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'T': [1,1,1,1,1, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0],
  'U': [1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'V': [1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,0,1,0, 0,1,0,1,0, 0,0,1,0,0],
  'W': [1,0,0,0,1, 1,0,0,0,1, 1,0,1,0,1, 1,0,1,0,1, 1,1,0,1,1, 1,1,0,1,1, 1,0,0,0,1],
  'X': [1,0,0,0,1, 1,0,0,0,1, 0,1,0,1,0, 0,0,1,0,0, 0,1,0,1,0, 1,0,0,0,1, 1,0,0,0,1],
  'Y': [1,0,0,0,1, 1,0,0,0,1, 0,1,0,1,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0],
  'Z': [1,1,1,1,1, 0,0,0,0,1, 0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 1,0,0,0,0, 1,1,1,1,1],
  '[': [0,1,1,1,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,1,1,0],
  '\\':[1,0,0,0,0, 1,0,0,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,0,1,0],
  ']': [0,1,1,1,0, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0, 0,1,1,1,0],
  '^': [0,0,1,0,0, 0,1,0,1,0, 1,0,0,0,1, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0],
  '_': [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 1,1,1,1,1],
  '`': [0,1,0,0,0, 0,0,1,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0],
  // lowercase - map to uppercase for simplicity
  'a': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1],
  'b': [1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0],
  'c': [0,0,0,0,0, 0,0,0,0,0, 0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,0, 1,0,0,0,1, 0,1,1,1,0],
  'd': [0,0,0,1,0, 0,0,0,1,0, 0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'e': [0,0,0,0,0, 0,0,0,0,0, 0,1,1,1,0, 1,0,0,0,1, 1,1,1,1,1, 1,0,0,0,0, 0,1,1,1,0],
  'f': [0,0,1,1,0, 0,1,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0],
  'g': [0,0,0,0,0, 0,0,0,0,0, 0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,1, 0,0,0,1,0],
  'h': [1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1],
  'i': [0,1,0,0,0, 0,0,0,0,0, 0,1,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,1,1,1,0],
  'j': [0,0,0,1,0, 0,0,0,0,0, 0,0,1,1,0, 0,0,0,1,0, 0,0,0,1,0, 1,0,0,1,0, 0,1,1,0,0],
  'k': [1,0,0,0,0, 1,0,0,0,0, 1,0,1,0,0, 1,1,0,0,0, 1,0,1,0,0, 1,0,0,1,0, 1,0,0,0,1],
  'l': [0,1,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,1,1,1,0],
  'm': [0,0,0,0,0, 0,0,0,0,0, 1,1,0,1,0, 1,0,1,0,1, 1,0,1,0,1, 1,0,1,0,1, 1,0,0,0,1],
  'n': [0,0,0,0,0, 0,0,0,0,0, 1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1],
  'o': [0,0,0,0,0, 0,0,0,0,0, 0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'p': [0,0,0,0,0, 0,0,0,0,0, 1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0, 1,0,0,0,0],
  'q': [0,0,0,0,0, 0,0,0,0,0, 0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0, 0,0,0,1,0],
  'r': [0,0,0,0,0, 0,0,0,0,0, 1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0],
  's': [0,0,0,0,0, 0,0,0,0,0, 0,1,1,1,0, 1,0,0,0,0, 0,1,1,1,0, 0,0,0,0,1, 1,1,1,1,0],
  't': [0,0,1,0,0, 0,0,1,0,0, 1,1,1,1,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,1,0],
  'u': [0,0,0,0,0, 0,0,0,0,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'v': [0,0,0,0,0, 0,0,0,0,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,0,1,0, 0,0,1,0,0],
  'w': [0,0,0,0,0, 0,0,0,0,0, 1,0,0,0,1, 1,0,1,0,1, 1,0,1,0,1, 1,1,0,1,1, 1,0,0,0,1],
  'x': [0,0,0,0,0, 0,0,0,0,0, 1,0,0,0,1, 0,1,0,1,0, 0,0,1,0,0, 0,1,0,1,0, 1,0,0,0,1],
  'y': [0,0,0,0,0, 0,0,0,0,0, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,1, 0,0,0,0,1, 0,1,1,1,0],
  'z': [0,0,0,0,0, 0,0,0,0,0, 1,1,1,1,1, 0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 1,1,1,1,1],
  '{': [0,0,1,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,0,1,0,0],
  '|': [0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0],
  '}': [0,1,0,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,0,1,0, 0,0,1,0,0, 0,0,1,0,0, 0,1,0,0,0],
  '~': [0,0,0,0,0, 0,0,0,0,0, 0,1,1,0,0, 1,0,0,1,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0],
};

function drawGlyph(x: number, y: number, ch: string, scale: number, c: Color): void {
  const glyph = GLYPHS[ch.toUpperCase()] || GLYPHS[' '];
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      if (glyph[gy * 5 + gx]) {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            setPixel(x + gx * scale + sx, y + gy * scale + sy, c);
          }
        }
      }
    }
  }
}

function textWidth(text: string, scale: number): number {
  if (!text) return 0;
  return text.length * (5 * scale + scale) - scale;
}

function drawText(x: number, y: number, text: string, scale: number, c: Color): void {
  let cx = x;
  for (const ch of text) {
    drawGlyph(cx, y, ch, scale, c);
    cx += (5 * scale) + scale;
  }
}

function drawTextCentered(y: number, text: string, scale: number, c: Color, maxW: number): void {
  const tw = textWidth(text, scale);
  const x = Math.max(0, Math.floor((maxW - tw) / 2));
  drawText(x, y, text, scale, c);
}

function drawTextWrapped(x: number, y: number, text: string, scale: number, c: Color, maxW: number, lineH: number): number {
  const words = text.split(' ');
  let cx = x;
  let cy = y;
  let lineStartX = x;

  for (const word of words) {
    const w = textWidth(word + ' ', scale);
    if (cx - lineStartX + w > maxW && cx > lineStartX) {
      cx = lineStartX;
      cy += lineH;
    }
    drawText(cx, cy, word + ' ', scale, c);
    cx += w;
  }
  return cy + lineH;
}

// ============================================================================
// PNG ENCODER
// ============================================================================
function writeBE32(arr: Uint8Array, offset: number, val: number): void {
  arr[offset] = (val >>> 24) & 0xff;
  arr[offset + 1] = (val >>> 16) & 0xff;
  arr[offset + 2] = (val >>> 8) & 0xff;
  arr[offset + 3] = val & 0xff;
}

function crc32buf(data: Uint8Array): number {
  return crc32(data) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const chunk = new Uint8Array(4 + 4 + len + 4);
  writeBE32(chunk, 0, len);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  const crcData = chunk.slice(4, 8 + len);
  const crc = crc32buf(crcData);
  writeBE32(chunk, 8 + len, crc);
  return chunk;
}

function encodePNG(pixels: Uint8Array, width: number, height: number): Uint8Array {
  // Build scanlines with filter byte 0 (none)
  const stride = width * 3;
  const scanlines = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    scanlines[y * (stride + 1)] = 0; // filter type 0
    scanlines.set(pixels.slice(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const compressed = deflateSync(scanlines);

  // PNG signature
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = new Uint8Array(13);
  writeBE32(ihdrData, 0, width);
  writeBE32(ihdrData, 4, height);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // colour type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // IDAT
  const idatData = compressed;

  // IEND
  const iendData = new Uint8Array(0);

  const chunks = [
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', iendData),
  ];

  const total = sig.length + chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  out.set(sig, off); off += sig.length;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ============================================================================
// LAYOUT HELPERS
// ============================================================================
function drawPanel(x: number, y: number, w: number, h: number, borderColor: Color, fillColor: Color): void {
  fillRect(x, y, w, h, fillColor);
  // border
  for (let i = 0; i < w; i++) { setPixel(x + i, y, borderColor); setPixel(x + i, y + h - 1, borderColor); }
  for (let i = 0; i < h; i++) { setPixel(x, y + i, borderColor); setPixel(x + w - 1, y + i, borderColor); }
}

// ============================================================================
// MAIN RENDER
// ============================================================================
function render(): void {
  // Clear to paper
  fillRect(0, 0, W, H, COLORS.paper);

  // Outer dark border (4px)
  const borderW = 4;
  fillRect(0, 0, W, borderW, COLORS.ink);
  fillRect(0, H - borderW, W, borderW, COLORS.ink);
  fillRect(0, 0, borderW, H, COLORS.ink);
  fillRect(W - borderW, 0, borderW, H, COLORS.ink);

  let y = borderW + 16;

  // Masthead: "THE WORLD LEDGER"
  drawTextCentered(y, "THE WORLD LEDGER", 4, COLORS.ink, W);
  y += 7 * 4 + 8;

  // Date line
  drawTextCentered(y, "MONDAY 23 NOVEMBER 2026", 2, COLORS.teal, W);
  y += 7 * 2 + 10;

  // Thin rule
  fillRect(borderW + 60, y, W - 2 * (borderW + 60), 2, COLORS.teal);
  y += 10;

  // Front page label left, section tags right
  drawText(borderW + 20, y, "FRONT PAGE", 1, COLORS.ink);
  const tags = "MARKETS  DIPLOMACY  CLIMATE  WORLD";
  const tagsW = textWidth(tags, 1);
  drawText(W - borderW - 20 - tagsW, y, tags, 1, COLORS.teal);
  y += 7 + 16;

  // ===== LEAD PANELS (side by side) =====
  const panelY = y;
  const panelW = (W - 2 * borderW - 60) / 2;
  const panelX1 = borderW + 20;
  const panelX2 = panelX1 + Math.floor(panelW) + 20;
  const panelH = 320;

  // ----- LEAD 1: MARKETS -----
  drawPanel(panelX1, panelY, Math.floor(panelW), panelH, COLORS.teal, COLORS.light);

  let ly = panelY + 12;
  // Section label
  drawText(panelX1 + 12, ly, "MARKETS", 1, COLORS.teal);
  ly += 10;

  // Illustration: simple candlestick chart
  const chartX = panelX1 + 12;
  const chartY = ly;
  const chartW = Math.floor(panelW) - 24;
  const chartH = 80;
  fillRect(chartX, chartY, chartW, chartH, COLORS.paper);
  // Draw some candlesticks (downward trend)
  const candleW = Math.max(2, Math.floor(chartW / 12));
  const spacing = Math.floor(chartW / 11);
  for (let i = 0; i < 11; i++) {
    const cx = chartX + i * spacing + 2;
    const open = chartY + Math.floor(chartH * (0.2 + 0.5 * Math.sin(i * 0.8)));
    const close = chartY + Math.floor(chartH * (0.3 + 0.6 * Math.sin(i * 0.8 + 0.5)));
    const high = Math.min(open, close) - Math.floor(chartH * 0.05);
    const low = Math.max(open, close) + Math.floor(chartH * 0.05);
    const bullish = close < open;
    const c = bullish ? COLORS.red : COLORS.green;
    // wick
    drawLine(cx + Math.floor(candleW/2), high, cx + Math.floor(candleW/2), low, COLORS.ink);
    // body
    fillRect(cx, Math.min(open, close), candleW, Math.abs(close - open) || 1, c);
  }
  ly = chartY + chartH + 10;

  // Red headline (wrapped to two lines to fit panel)
  const headline1a = "WALL ST IN CORRECTION AS AI SELLOFF";
  const headline1b = "WIPES $4 TRILLION";
  drawText(panelX1 + 12, ly, headline1a, 2, COLORS.red);
  ly += 7 * 2 + 2;
  drawText(panelX1 + 12, ly, headline1b, 2, COLORS.red);
  ly += 7 * 2 + 6;

  // Deck (ink)
  const deck1 = "S&P 500 -8.6% wk, Nasdaq -10% wk, worst since Mar 2020. Nvidia -23% wk, -40% since Nov. VIX 35.89. Asia: Nikkei -5.1%, Taiex -6.2% Fri. Tokyo closed Mon holiday. Thanksgiving week ahead.";
  ly = drawTextWrapped(panelX1 + 12, ly, deck1, 1, COLORS.ink, Math.floor(panelW) - 24, 11);
  ly += 4;

  // Quote banner (centered)
  const quote1 = '"This seems like a real correction which has further to go"';
  const qw1 = textWidth(quote1, 1);
  const qx1 = panelX1 + Math.floor((Math.floor(panelW) - qw1) / 2);
  drawText(qx1, ly, quote1, 1, COLORS.teal);
  ly += 10;

  // ----- LEAD 2: COP31 -----
  drawPanel(panelX2, panelY, Math.floor(panelW), panelH, COLORS.teal, COLORS.light);

  ly = panelY + 12;
  drawText(panelX2 + 12, ly, "DIPLOMACY / CLIMATE", 1, COLORS.teal);
  ly += 10;

  // Illustration: globe-ish with X
  const gx = panelX2 + Math.floor(panelW) / 2;
  const gy = ly + 40;
  const gr = 35;
  // circle
  for (let ang = 0; ang < 360; ang += 5) {
    const rad = ang * Math.PI / 180;
    const px = Math.floor(gx + gr * Math.cos(rad));
    const py = Math.floor(gy + gr * Math.sin(rad));
    setPixel(px, py, COLORS.teal);
  }
  // X over it
  drawLine(gx - 20, gy - 20, gx + 20, gy + 20, COLORS.red);
  drawLine(gx + 20, gy - 20, gx - 20, gy + 20, COLORS.red);
  ly = gy + gr + 10;

  const headline2 = "COP31 COLLAPSES: NO DEAL IN ANTALYA";
  drawText(panelX2 + 12, ly, headline2, 2, COLORS.red);
  ly += 7 * 2 + 6;

  const deck2 = "Antalya Pact rejected Sun 22 Nov after EU, Panama, Norway, island states oppose fossil fuel omission. Text only reaffirmed COP28. Longest UN climate summit on record (14 days). US absent 2nd yr.";
  ly = drawTextWrapped(panelX2 + 12, ly, deck2, 1, COLORS.ink, Math.floor(panelW) - 24, 11);
  ly += 4;

  const quote2 = '"We will not endorse a decision that does not respond to the science"';
  const qw2 = textWidth(quote2, 1);
  const qx2 = panelX2 + Math.floor((Math.floor(panelW) - qw2) / 2);
  drawText(qx2, ly, quote2, 1, COLORS.teal);

  // ===== DIVIDER =====
  y = panelY + panelH + 16;
  fillRect(borderW + 40, y, W - 2 * (borderW + 40), 3, COLORS.teal);
  y += 12;

  // ===== AROUND THE WORLD header =====
  drawTextCentered(y, "AROUND THE WORLD", 2, COLORS.ink, W);
  y += 7 * 2 + 12;

  // ===== 6 BRIEF CARDS (2 rows x 3 cols) =====
  const briefs = [
    { cat: "EUROPE / UKRAINE", head: "RUSSIA HITS ZELENSKY HOMETOWN; DRONES SET SHIP AFIRE", note: "Kryvyi Rih strike Fri night: 2 dead (boy 7, paramedic 20), 60 hurt inc 6 children. Double-tap on rescuers. 3 missiles, 148 drones nationwide. Sat: Sparta II cargo ship hit in Gulf of Finland, fire drifts to Finnish waters. Zelensky: \"For us, he is a killer.\"" },
    { cat: "AMERICAS / TECH", head: "FBI PROBES HACK OF NATIONAL CRIME DATABASE", note: "NCIC database breached (fugitives, missing persons, gun checks). CNN broke Fri 20 Nov; AP confirmed Sat. FBI silent on data taken. 2nd FBI cyberattack in months after Sep ShinyHunters theft. Trump Sat: \"Not good... maybe we'll learn things.\"" },
    { cat: "MIDDLE EAST / GULF", head: "HOUTHI MISSILES HIT RIYADH TALLEST TOWER", note: "Fri strike damages PIF tower in King Abdullah Financial Dist. No casualties. Sat: 2 more tankers hit off Oman as Iran strikes near-daily. Brent $89.95 (+0.57%). US-Iran war began 28 Feb 2026." },
    { cat: "TECH / ENTERTAINMENT", head: "GTA 6 MAKES $3.79B IN A DAY - RECORD LAUNCH", note: "Take-Two confirms Thu 19 Nov launch: 32.5M copies day one. Metacritic 99 (tie record). GTA V did $800M/24h in 2013 - GTA VI nearly 5x. 132M hours watched launch day." },
    { cat: "AFRICA / DISASTER", head: "24 DEAD AS FUNERAL BOAT CAPSIZES IN NIGERIA", note: "Fri Bayelsa State: boat Ayama to Ukubie capsized. NEMA Sat: 24 bodies, 24 rescued, search continues. Mechanical failure; manager detained, driver fled. Residents claim 300+ aboard (unconfirmed)." },
    { cat: "ASIA / EDUCATION", head: "S KOREA MINISTER QUITS OVER AI EXAM CHEATING", note: "Edu Min Choi Kyo-jin resigned Sun 22 Nov; Pres Lee accepted in ~1hr. Suneung (550k students) Thu 19 Nov. Tax accountant top scorer admitted AI cheating Sat 15 Nov. 111 suspected e-device cases incl 5 smart glasses/mini-cams." },
  ];

  const cardW = (W - 2 * borderW - 80) / 3;
  const cardH = 200;
  const startX = borderW + 30;

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const bx = startX + col * (Math.floor(cardW) + 20);
      const by = y + row * (cardH + 16);

      drawPanel(bx, by, Math.floor(cardW), cardH, COLORS.brown, COLORS.paper);

      let cy = by + 8;
      // Category label (red)
      drawText(bx + 8, cy, briefs[idx].cat, 1, COLORS.red);
      cy += 10;

      // Headline (ink, scale 1)
      cy = drawTextWrapped(bx + 8, cy, briefs[idx].head, 1, COLORS.ink, Math.floor(cardW) - 16, 9);
      cy += 4;

      // Note (ink, scale 1)
      cy = drawTextWrapped(bx + 8, cy, briefs[idx].note, 1, COLORS.ink, Math.floor(cardW) - 16, 11);
    }
  }

  y += 2 * (cardH + 16) + 20;

  // ===== FOOTER =====
  const footerY = H - borderW - 20;
  drawText(borderW + 20, footerY, "THE WORLD LEDGER  MONDAY 23 NOVEMBER 2026  A VISUAL SUMMARY OF THE DAY'S REPORTED NEWS", 1, COLORS.ink);
  const footerRight = "NEWS IMAGE EDITION";
  const frW = textWidth(footerRight, 1);
  drawText(W - borderW - 20 - frW, footerY, footerRight, 1, COLORS.teal);
}

// ============================================================================
// ENTRY POINT
// ============================================================================
function main(): void {
  render();

  const png = encodePNG(buf, W, H);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);

  console.log(`Written ${png.length} bytes to ${outPath}`);
  if (png.length > 1048576) {
    console.error(`ERROR: PNG exceeds 1 MiB (${png.length} bytes)`);
    process.exit(1);
  }
}

main();