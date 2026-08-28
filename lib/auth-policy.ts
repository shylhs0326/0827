export type AppRole = 'ADMIN' | 'USER';

export function canChangeRole({ actorId, targetId, nextRole }: { actorId: string; targetId: string; nextRole: AppRole }) {
  return actorId !== targetId || nextRole === 'ADMIN';
}

export function canChangeActive({ actorId, targetId, nextActive }: { actorId: string; targetId: string; nextActive: boolean }) {
  return actorId !== targetId || nextActive;
}
