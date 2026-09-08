/**
 * What a feature asks for, independent of who fulfils it.
 *
 * Features request a capability; the registry picks a provider. Nothing outside
 * an adapter should know which vendor is behind a capability.
 */
export const AI_CAPABILITIES = [
  'text.generate',
  'text.rewrite',
  'world.brainstorm',
  'image.generate',
  'image.edit',
  'image.variation',
  'image.character_sheet',
  'code.generate',
  'code.modify',
  'prototype.generate',
] as const;

export type AiCapability = (typeof AI_CAPABILITIES)[number];

export function isAiCapability(value: string): value is AiCapability {
  return (AI_CAPABILITIES as readonly string[]).includes(value);
}
