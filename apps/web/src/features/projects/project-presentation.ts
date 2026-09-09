import type { ProjectStatus } from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

export function projectStatusBadge(status: ProjectStatus): { tone: StatusTone; label: string } {
  return status === 'active'
    ? { tone: 'success', label: 'Active' }
    : { tone: 'neutral', label: 'Archived' };
}
