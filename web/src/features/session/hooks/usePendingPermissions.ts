import { useEffect, useState } from 'react';

import { permissionQueueOf } from '@/features/permission';
import { usePanelSessions } from './usePanelTabs';

/**
 * How many questions Claude is waiting on in a folder tab — every session of its panel, the ones not
 * on screen included (plan 08, B-42). Answered on another device, the count drops with the queue
 * (S-190): the queue reacts to `permission.resolved`, never to its own optimism.
 */
export function usePendingPermissions(folder: string): number {
  const sessions = usePanelSessions(folder);
  const key = sessions.join('\n');
  const [count, setCount] = useState(0);

  useEffect(() => {
    const queues = key === '' ? [] : key.split('\n').map(permissionQueueOf);
    const recount = (): void => {
      setCount(queues.reduce((sum, queue) => sum + queue.getState().pending.length, 0));
    };

    recount();
    const stops = queues.map((queue) => queue.subscribe(recount));

    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, [key]);

  return count;
}
