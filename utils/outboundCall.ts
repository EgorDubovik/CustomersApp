/**
 * Звонки из приложения пока есть только на iOS (outboundCall.ios.ts). Здесь —
 * те же функции, которые честно говорят «не поддерживается».
 */
export const outboundCallsSupported = false;

export function toDialableNumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+1${digits.slice(-10)}`;
}

export function toCallerId(companyPhone: string): string {
  return `+1${companyPhone.replace(/\D/g, '').slice(-10)}`;
}

export function subscribeToConnection(onChange: (connected: boolean) => void): () => void {
  onChange(false);
  return () => {};
}

export async function placeOutboundCall(_destination: string, _companyPhone: string, _userId: number | undefined): Promise<void> {
  throw new Error('Calls from the app are available on iPhone only');
}
