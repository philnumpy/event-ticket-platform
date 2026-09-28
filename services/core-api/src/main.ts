import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/domain-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Nginx (docker-compose.yml / nginx/nginx.conf), the direct socket
  // peer for every request is the Nginx container, not the real client --
  // without trusting the proxy, TokenBucketGuard's `req.ip` would be the
  // same value for every caller, collapsing every client into one shared
  // bucket. `1` trusts exactly one hop (the gateway itself), reading the
  // client IP from X-Forwarded-For rather than trusting an arbitrary chain
  // of proxies a request might claim to have passed through.
  app.set('trust proxy', 1);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`core-api listening on :${port}`);
}

bootstrap();
