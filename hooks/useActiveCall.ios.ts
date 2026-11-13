import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { TelnyxCallState, type Call } from '@telnyx/react-voice-commons-sdk';
import { voipClient } from '../utils/voipCalls.ios';

/**
 * Идущий звонок для всего приложения: экран разговора, плашка «вернуться к
 * звонку» и автопереход на экран смотрят на одно и то же.
 */

export const ACTIVE_CALL_ROUTE = '/calls/active-call';

/**
 * Когда начался разговор (ответ), по id звонка. Хранится вне экрана: экран
 * разговора закрывают и открывают снова посреди звонка, и таймер не должен
 * начинаться с нуля.
 */
const answeredAt = new Map<string, number>();

export function callAnsweredAt(call: Call | null): number | null {
  return call ? (answeredAt.get(call.callId) ?? null) : null;
}

export function useActiveCall(): { call: Call | null; state: TelnyxCallState | null } {
  const [call, setCall] = useState<Call | null>(voipClient.currentActiveCall);
  const [state, setState] = useState<TelnyxCallState | null>(call?.currentState ?? null);

  useEffect(() => {
    const sub = voipClient.activeCall$.subscribe(setCall);
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!call) {
      setState(null);
      return;
    }
    const sub = call.callState$.subscribe((next) => {
      if (next === TelnyxCallState.ACTIVE && !answeredAt.has(call.callId)) answeredAt.set(call.callId, Date.now());
      if (next === TelnyxCallState.ENDED || next === TelnyxCallState.FAILED) answeredAt.delete(call.callId);
      setState(next);
    });
    return () => sub.unsubscribe();
  }, [call]);

  return { call, state };
}

/** Секунды разговора, тикают раз в секунду, пока звонок идёт. */
export function useCallSeconds(call: Call | null, state: TelnyxCallState | null): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (state !== TelnyxCallState.ACTIVE) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  const started = callAnsweredAt(call);
  return started ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : 0;
}

/**
 * Открывает экран разговора, когда пользователь до звонка добирается:
 * - принял входящий (с экрана блокировки, баннером или в приложении) — экран
 *   CallKit сам в приложение не ведёт, оно просто открывается там, где было;
 * - вернулся в приложение посреди разговора (нажал на системный значок звонка).
 *
 * Если пользователь сам ушёл с экрана разговора, пока приложение открыто, его
 * не возвращаем — для этого есть плашка «Return to call».
 */
export function useOpenCallScreen(): void {
  const router = useRouter();
  const pathname = usePathname();
  const { call, state } = useActiveCall();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const opened = useRef(new Set<string>());

  const open = () => {
    if (pathRef.current === ACTIVE_CALL_ROUTE) return;
    router.push(ACTIVE_CALL_ROUTE as any);
  };

  // Входящий ответили — один раз на звонок
  useEffect(() => {
    if (!call?.isIncoming || state !== TelnyxCallState.ACTIVE || opened.current.has(call.callId)) return;
    opened.current.add(call.callId);
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, state]);

  // Вернулись в приложение посреди разговора
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const current = voipClient.currentActiveCall;
      if (next === 'active' && current && current.currentState === TelnyxCallState.ACTIVE) open();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
