import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { execSync } from 'child_process';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_DB_PATH = join(__dirname, 'settings-integration-test.db');
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

describe('Settings API (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    delete process.env.PATENTFORGE_TOKEN;

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
    app.useGlobalGuards(new AuthGuard());
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    // Reset settings to clean state between tests
    await prisma.appSettings.deleteMany();
  });

  describe('GET /api/settings', () => {
    it('returns 200 with an object containing defaultModel and maxTokens', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/settings')
        .expect(200);

      expect(res.body).toHaveProperty('defaultModel');
      expect(res.body).toHaveProperty('maxTokens');
      expect(typeof res.body.defaultModel).toBe('string');
      expect(typeof res.body.maxTokens).toBe('number');
    });

    it('returns the singleton settings record', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/settings')
        .expect(200);

      // id should be the singleton string
      expect(res.body.id).toBe('singleton');
    });
  });

  describe('PUT /api/settings', () => {
    it('updates maxTokens and returns 200 with updated settings', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/settings')
        .send({ maxTokens: 64000 })
        .expect(200);

      expect(res.body.maxTokens).toBe(64000);
    });

    it('updates defaultModel and persists the change', async () => {
      await request(app.getHttpServer())
        .put('/api/settings')
        .send({ defaultModel: 'claude-opus-4-20250514' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/settings')
        .expect(200);

      expect(res.body.defaultModel).toBe('claude-opus-4-20250514');
    });

    it('returns 400 when maxTokens is not a valid integer', async () => {
      await request(app.getHttpServer())
        .put('/api/settings')
        .send({ maxTokens: 'not-a-number' })
        .expect(400);
    });

    it('returns 400 when maxTokens is below minimum (0)', async () => {
      await request(app.getHttpServer())
        .put('/api/settings')
        .send({ maxTokens: 0 })
        .expect(400);
    });
  });
});
