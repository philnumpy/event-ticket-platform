import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogCacheService } from './catalog-cache.service';
import { SearchShowsQueryDto } from './dto/search-shows.query.dto';

@Controller('shows')
export class CatalogController {
  constructor(private readonly catalogCache: CatalogCacheService) {}

  @Get()
  async search(@Query() query: SearchShowsQueryDto) {
    return this.catalogCache.browse({
      city: query.city,
      genre: query.genre,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    });
  }

  @Get(':id/seat-map')
  async seatMap(@Param('id') id: string) {
    return this.catalogCache.seatMap(id);
  }
}
