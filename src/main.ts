import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useMetaStore } from './stores/meta';
import { wireBattleLog } from './stores/battle';
import { initCustomCursor } from './core/cursor';
import { initAudio, setMuted, playBg, bgForScreen } from './core/audio';
// Шрифты бандлятся локально (оффлайн Electron): EB Garamond — заголовки/имена,
// системный sans остаётся для мелких служебных надписей.
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/600.css';
import '@fontsource/eb-garamond/700.css';
import './assets/styles/main.scss';

/**
 * Порядок важен: meta.init() читает сейв ДО монтирования, чтобы хаб
 * сразу отрисовал актуальные ресурсы. Автосейв включается в init().
 */
async function boot(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  wireBattleLog();
  const meta = useMetaStore(pinia);
  await meta.init();

  initAudio(meta.audioMuted);
  // Стартовый экран — своя музыка (ui.setScreen дальше меняет по экранам)
  {
    const bg = bgForScreen('menu');
    if (bg) playBg(bg);
  }
  // Хоткей M — переключение звука (состояние в профиле)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') {
      meta.audioMuted = !meta.audioMuted;
      setMuted(meta.audioMuted);
    }
  });

  void initCustomCursor(); // асинхронно: ресайз PNG — mount не ждёт
  app.mount('#app');
}

void boot();
