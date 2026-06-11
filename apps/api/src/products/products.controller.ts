import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { productQuerySchema, type ProductPage, type ProductQuery } from '@app/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /**
   * GET /products?limit=&cursor=
   * `limit` is strictly validated to [5, 50] by the shared Zod schema; an
   * out-of-range value yields HTTP 400 rather than being silently clamped.
   */
  @Get()
  list(
    @Query(new ZodValidationPipe(productQuerySchema)) query: ProductQuery,
  ): Promise<ProductPage> {
    return this.products.findPage(query.limit, query.cursor);
  }
}
