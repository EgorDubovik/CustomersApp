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
    address?: { full: string };
    customer?: { id: number; name: string; email: string; phone: string; jobsCount: number; addresses?: { full: string }[] };
    appointments?: { id: number; status: number; start: string; end: string; techs?: { id: number; name: string; color: string }[] }[];
    notes?: INote[];
  };
}

export interface Point {
  x: number;
  y: number;
}
