/// <reference types="vite/client" />

// Переменные окружения сборки (файл .env в корне проекта)
interface ImportMetaEnv {
  /** Адрес проекта Supabase, например https://abcd.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Публичный ключ Supabase (anon / publishable) */
  readonly VITE_SUPABASE_KEY?: string;
  /** Коммит, из которого собрана игра (ставит сборка на GitHub) — для статистики партий */
  readonly VITE_GAME_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
