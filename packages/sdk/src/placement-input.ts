import type { Placement, PlacementInput } from './types.js';

export function resolvePlacementInput(input: PlacementInput): Placement {
  const placement = input.placement;
  const multiBoard = input.multiBoard;
  if (!!placement === !!multiBoard) throw new Error('Provide exactly one of placement or multiBoard.');
  if (placement) return placement;
  if (!multiBoard || !/^[a-z][a-z0-9-]{1,63}$/.test(multiBoard.platformId)
    || !Number.isSafeInteger(multiBoard.chainId) || multiBoard.chainId <= 0
    || !multiBoard.communityId.trim()) throw new Error('Invalid multiBoard platform identity.');
  return { kind: 'platform-community', platformId: multiBoard.platformId, chainId: multiBoard.chainId,
    communityId: multiBoard.communityId };
}
