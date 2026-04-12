import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { execSync } from 'child_process';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/auth.guard';

const TEST_DB_PATH = join(__dirname, 'auth-integration-test.db');
const TEST_DB_URL = `file:${TEST_DB_PATH}`;
const TEST_TOKEN = 'test-secret-token';

describe('Auth guard (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    // Enable token-based auth for these tests
    process.env.PATENTFORGE_TOKEN = TEST_TOKEN;

    execSync('npx prisma db push --force-reset --skip-generate', {
      cwd: join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: 'pipe',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // AuthGuard reads PATENTFORGE_TOKEN from env at construction time
    app.useGlobalGuards(new AuthGuard());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PATENTFORGE_TOKEN;
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  it('returns 401 when no Authorization header is provided', async () => {
    await request(app.getHttpServer())
      .get('/api/projects')
      .expect(401);
  });

  it('returns 401 when wrong token is provided', async () => {
    await request(app.getHttpServer())
      .get('/api/projects')
      .set('Authorization', 'Bearer wrong-token')
      .expect(401);
  });

  it('returns 401 when Authorization header has wrong scheme', async () => {
    await request(app.getHttpServer())
      .get('/api/projects')
      .set('Authorization', `Basic ${TEST_TOKEN}`)
      .expect(401);
  });

  it('returns 200 when correct Bearer token is provided', async () => {
    await request(app.getHttpServer())
      .get('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);
  });
});
