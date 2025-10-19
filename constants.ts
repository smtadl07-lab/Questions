
import { Language } from './types';

// The specific Gemini model to be used for generating questions.
export const GEMINI_MODEL = 'gemini-2.5-flash';

// Language options available in the UI, with their native and English names.
export const LANGUAGE_OPTIONS = [
  { value: Language.EN, label: 'English' },
  { value: Language.AR, label: 'العربية' },
  { value: Language.ZH, label: '中文' },
  { value: Language.KO, label: '한국어' },
];
