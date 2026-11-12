/**
 * Входящие звонки через VoIP-пуши пока есть только на iOS (voipCalls.ios.ts).
 * На остальных платформах — пустые функции с той же сигнатурой, чтобы общий код
 * не проверял платформу сам и не тянул нативный SDK Telnyx туда, где он не настроен.
 */
export async function startVoipCalls(_authToken: string): Promise<void> {}

export async function stopVoipCalls(_authToken: string): Promise<void> {}

export async function forgetVoipCalls(): Promise<void> {}
