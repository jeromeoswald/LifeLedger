import type { Task, TimeSession } from '@lifeledger/shared';

export interface WorkCtx {
  tasks: Task[];
  sessions: TimeSession[];
  tz: string;
  today: string;
  runningTaskId?: string;
  loading: boolean;
}
