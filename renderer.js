import { CronPanel } from './src/renderer/components/CronPanel.tsx';
import { CronSettings } from './src/renderer/components/CronSettings.tsx';

export function register(env) {
  globalThis.React = env.React;

  env.registerComponents('cron', {
    CronPanel,
    CronSettings,
  });
}
