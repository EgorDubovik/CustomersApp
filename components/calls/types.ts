// Mirrors frontend/src/pages/Calls/types.ts — keep the two in sync when the API changes.

export interface ICallComment {
  id: string;
  call_id: string;
  user_id: string | number;
  comment: string;
  created_at: string;
  user: { id: string | number; name: string; color?: string };
}

export interface ICall {
  id: string;
  from_number: string;
  to_number: string;
  direction: 'incoming' | 'outgoing' | string;
  conversation_id: string;
  duration_seconds: number;
  status: string;
  is_missed_call: boolean;
  recording_url: string | null;
  /** true — recording was on and the file is coming; false — off; null — unknown (legacy / OpenPhone) */
  recording_expected: boolean | null;
  voicemail_url: string | null;
  voicemail_duration: number | null;
  answered_at: string | null;
  completed_at: string | null;
  read_at: string | null;
  created_at: string;
  comments: ICallComment[];
  ai_details: { summary: string | null; transcription: string | null } | null;
}

export interface ISmsMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  text: string;
  status: 'received' | 'sent' | 'delivered' | 'failed';
  read_at: string | null;
  created_at: string;
}

export interface IConversationNote {
  id: string;
  note: string;
  created_at: string;
  user: { id: string | number; name: string; color?: string };
}

export interface IConversation {
  id: string;
  customer_name: string;
  customer_phone?: string;
  company_phone?: string;
  last_call_at: string;
  last_call: ICall | null;
  last_message: ISmsMessage | null;
  calls_count: number;
  unread_count: number;
  /** Populated only after the conversation is opened */
  calls?: ICall[];
  messages?: ISmsMessage[];
  conversation_notes?: IConversationNote[];
  customer?: { id: number; name: string; phone?: string } | null;
}

export type TimelineItem =
  | { type: 'call'; data: ICall; created_at: string }
  | { type: 'sms'; data: ISmsMessage; created_at: string }
  | { type: 'note'; data: IConversationNote; created_at: string };
