export interface ITech {
  id: number;
  name: string;
  color: string;
}

export interface ITimer {
  id: number;
  started_at: string;
  stopped_at: string | null;
  started_by?: { name: string };
  stopped_by?: { name: string };
}

export interface IService {
  id: number;
  name?: string;
  title?: string;
  description?: string;
  price: string;
  taxable?: boolean;
  is_active: boolean;
}

export interface IPayment {
  id: number;
  amount: string;
  created_at: string;
  type_text?: string;
}

export interface INote {
  id: number;
  text: string;
  created_at: string;
  creator: {
    id: number;
    name: string;
    color: string;
  };
}

export interface IImage {
  id: number;
  path: string;
  owner_id?: number;
  created_at?: string;
}

export interface IExpense {
  id: number;
  title: string;
  amount: number | string;
  created_at?: string;
}

export interface IInvoice {
  id: number;
  status: number; // 0 draft, 1 sent, 2 cancelled, 3 failed
  status_text?: string;
  balance_status: number; // 0 unpaid, 1 partially paid, 2 paid
  balance_status_text?: string;
  email?: string;
  recipients?: string[] | null;
  recipient_emails?: string[];
  pdf_path?: string;
  pdf_url?: string;
  is_delivered?: boolean;
  sent_at?: string;
  created_at?: string;
}

export interface IStickyNote {
  id: number;
  job_id: number;
  text: string;
  date: string;
  status: number; // 0 new, 1 completed
  employee_id: number;
  creator_id: number;
  employee?: { id: number; name: string; color: string };
  created_at?: string;
}

export interface IEmployee {
  id: number;
  name: string;
  color: string;
  active?: number;
  roles_ids?: number[];
}

export type AppointmentTabKey = 'work' | 'photos' | 'notes' | 'info';

export interface IAppointmentDetails {
  id: number;
  status: number;
  start: string;
  end: string;
  timers: ITimer[];
  techs: ITech[];
  job: {
    id: number;
    totalAmount: number;
    remainingBalance: number;
    services: IService[];
    payments: IPayment[];
    images?: IImage[];
    expenses?: IExpense[];
    invoices?: IInvoice[];
    address?: { full: string; lat?: number | string | null; lon?: number | string | null };
    customer?: { id: number; name: string; email: string; phone: string; jobsCount: number; addresses?: { full: string }[] };
    appointments?: { id: number; status: number; start: string; end: string; techs?: { id: number; name: string; color: string }[] }[];
    notes?: INote[];
  };
}

export interface Point {
  x: number;
  y: number;
}
