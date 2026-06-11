import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<AppConfig>(APP_CONFIG);

  // Trust the first proxy so req.ip reflects the real client (rate-limit / audit).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  // Cookie-based auth → explicit origin allow-list + credentials. No wildcard.
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Validation is handled per-route by ZodValidationPipe (shared Zod schemas),
  // so no global class-validator ValidationPipe is registered.
  app.enableShutdownHooks();

  await app.listen(config.port);
  console.log(`API listening on http://localhost:${config.port}`);
}

void bootstrap();
