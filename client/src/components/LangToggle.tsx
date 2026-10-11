import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const { user } = useAuth();
  const change = (l: 'en' | 'hi') => {
    setLang(l);
    if (user) api.post('/api/auth/language', { language: l }).catch(() => {});
  };
  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs font-medium ${className}`} role="group" aria-label="Language">
      <button className={`px-2.5 py-1.5 ${lang === 'en' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'}`} onClick={() => change('en')} aria-pressed={lang === 'en'}>EN</button>
      <button className={`px-2.5 py-1.5 ${lang === 'hi' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'}`} onClick={() => change('hi')} aria-pressed={lang === 'hi'}>हिं</button>
    </div>
  );
}
