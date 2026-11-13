/**
 * Звонки из приложения пока только на iOS (useActiveCall.ios.ts). Здесь — те же
 * имена без поведения, чтобы общий код не проверял платформу сам.
 */
export const ACTIVE_CALL_ROUTE = '/calls/active-call';

export function useOpenCallScreen(): void {}
