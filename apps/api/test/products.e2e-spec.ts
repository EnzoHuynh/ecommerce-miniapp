import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProductsController } from '../src/products/products.controller';
import { ProductsService } from '../src/products/products.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

describe('Products pagination (e2e)', () => {
  let app: INestApplication;
  const findPage = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: { findPage } }],
    })
      // Bypass auth — we're testing pagination/validation, not the guard.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findPage.mockReset();
    findPage.mockResolvedValue({ items: [], nextCursor: null });
  });

  it.each(['4', '51', '0', 'abc'])('rejects limit=%s with 400', async (limit) => {
    await request(app.getHttpServer()).get(`/products?limit=${limit}`).expect(400);
    expect(findPage).not.toHaveBeenCalled();
  });

  it.each(['5', '20', '50'])('accepts in-range limit=%s', async (limit) => {
    await request(app.getHttpServer()).get(`/products?limit=${limit}`).expect(200);
    expect(findPage).toHaveBeenCalledWith(Number(limit), undefined);
  });

  it('defaults the limit to 20 when omitted', async () => {
    await request(app.getHttpServer()).get('/products').expect(200);
    expect(findPage).toHaveBeenCalledWith(20, undefined);
  });

  it('passes the cursor through to the service', async () => {
    await request(app.getHttpServer()).get('/products?limit=10&cursor=abc123').expect(200);
    expect(findPage).toHaveBeenCalledWith(10, 'abc123');
  });
});
