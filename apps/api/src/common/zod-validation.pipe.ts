import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

/**
 * Validates/transforms an incoming payload against a Zod schema. On failure it
 * throws a 400 with a flattened, client-friendly error map. Using the SAME Zod
 * schemas shared with the front-end guarantees both ends agree on the contract.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: error.flatten().fieldErrors,
        });
      }
      throw new BadRequestException('Validation failed');
    }
  }
}
