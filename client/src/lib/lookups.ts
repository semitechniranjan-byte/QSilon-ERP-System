import { useApi } from '../components/ui';

export interface Lookups {
  years: { id: number; name: string; start_date: string; end_date: string; is_current: boolean; status: string }[];
  classes: { id: number; name: string; name_hi: string | null; code: string; sort_order: number; is_preschool: boolean; is_active: boolean }[];
  boards: { id: number; code: string; name: string; is_active: boolean }[];
  mediums: { id: number; code: string; name: string; is_active: boolean }[];
  subjects: { id: number; name: string; name_hi: string | null; code: string; is_active: boolean }[];
  sections: { id: number; academic_year_id: number; class_level_id: number; name: string; class_name: string; is_preschool: boolean; sort_order: number; board: string | null; medium: string | null; class_teacher_id: number | null; capacity: number | null; room: string | null; board_id: number | null; medium_id: number | null; is_active: boolean }[];
  categories: { id: number; code: string; name: string; name_hi: string | null; kind: string; default_frequency: string; is_active: boolean }[];
  routes: { id: number; name: string; monthly_fee_paise: number; is_active: boolean }[];
  terms: { id: number; academic_year_id: number; name: string; start_date: string | null; end_date: string | null }[];
  scales: { id: number; name: string; is_default: boolean }[];
  domains: { id: number; name: string; name_hi: string | null; sort_order: number; is_active: boolean }[];
}
export function useLookups() {
  const q = useApi<Lookups>('/api/settings/lookups');
  const current = q.data?.years.find((y) => y.is_current) ?? null;
  const sectionsFor = (yearId?: number | null) => (q.data?.sections ?? []).filter((s) => s.academic_year_id === (yearId ?? current?.id));
  const sectionLabel = (s: { class_name: string; name: string }) => `${s.class_name} – ${s.name}`;
  return { ...q, lk: q.data, current, sectionsFor, sectionLabel };
}
