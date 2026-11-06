import Phaser from 'phaser';
import { resetCampaignProgress } from '../storage/progress';
import { forgetTransferCode } from '../storage/transfer';
import { UI_WARNING_TEXT_COLOR } from '../view/palette';
import { createMenuButton, menuButtonLabel } from './menuButton';

const RESET_FONT_SIZE = 24;
/** Сколько ждать второго нажатия: сброс необратим, одно случайное касание его не запускает */
const RESET_CONFIRM_MS = 3000;
// Кнопка — треть ряда на экране правил, поэтому надписи в три коротких строки
const RESET_LABEL = 'Сброс\nпрогресса\nкампании';

/**
 * Кнопка сброса прогресса кампании: первое нажатие просит подтвердить, второе в течение
 * RESET_CONFIRM_MS стирает звёзды и траты всех уровней (открыт останется только 1-1) и забывает
 * код переноса — иначе при следующем сохранении прогресс вернулся бы с сервера
 */
export function addResetProgressButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const text = menuButtonLabel(scene, RESET_LABEL, RESET_FONT_SIZE, UI_WARNING_TEXT_COLOR);
  text.setAlign('center');
  let armed: Phaser.Time.TimerEvent | null = null;
  createMenuButton(
    scene,
    x,
    y,
    [text],
    () => {
      if (!armed) {
        text.setText('Нажмите\nещё раз —\nвсё сотрётся');
        armed = scene.time.delayedCall(RESET_CONFIRM_MS, () => {
          armed = null;
          text.setText(RESET_LABEL);
        });
        return;
      }
      armed.remove();
      armed = null;
      resetCampaignProgress();
      forgetTransferCode();
      text.setText('Прогресс\nкампании\nсброшен');
      scene.time.delayedCall(RESET_CONFIRM_MS, () => {
        if (text.active) text.setText(RESET_LABEL);
      });
    },
    width,
    height,
  );
}
