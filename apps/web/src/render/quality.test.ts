import { describe, expect, it } from 'vitest';
import { detectTier } from './quality';

describe('detectTier', () => {
  it('puts software and old GPUs on low', () => {
    expect(detectTier({ gpu: 'Google SwiftShader' })).toBe('low');
    expect(detectTier({ gpu: 'Mali-G52 MC2', mobile: true })).toBe('low');
    expect(detectTier({ memory: 2, cores: 8 })).toBe('low');
  });
  it('puts strong GPUs on high', () => {
    expect(detectTier({ gpu: 'Apple GPU', mobile: true })).toBe('high');
    expect(detectTier({ gpu: 'NVIDIA GeForce RTX 3060', cores: 12 })).toBe('high');
  });
  it('defaults phones to medium', () => {
    expect(detectTier({ gpu: 'Adreno (TM) 640', mobile: true, cores: 8 })).toBe('medium');
    expect(detectTier({ mobile: true })).toBe('medium');
  });
});
