import { Module } from '@nestjs/common';
import { DomainModule } from '../persistence/domain.module';
import { CatalogController } from './catalog.controller';
import { CatalogCacheService } from './catalog-cache.service';

@Module({
  imports: [DomainModule],
  controllers: [CatalogController],
  providers: [CatalogCacheService],
  exports: [CatalogCacheService],
})
export class CatalogModule {}
