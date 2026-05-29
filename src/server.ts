import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const port = env.PORT;

app.listen(port, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏠 MesonBots API');
  console.log(`📍 http://localhost:${port}`);
  console.log(`🌍 ${env.NODE_ENV}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
