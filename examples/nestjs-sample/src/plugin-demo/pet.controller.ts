import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@apiforge/nestjs';
import { CreatePetDto, PetResponseDto, PetListResponseDto } from './pet.dto';

// Only @ApiTags and @ApiBearerAuth are manual.
// @ApiOkResponse / @ApiCreatedResponse are auto-injected by plugin from return types!
@ApiBearerAuth('JWT')
@ApiTags('pets')
@Controller('api/v1/pets')
export class PetController {

  @Get()
  async findAll(@Query('species') species?: string): Promise<PetListResponseDto> {
    return { items: [], total: 0 };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<PetResponseDto> {
    return { id, name: 'Buddy', species: 'dog', createdAt: new Date().toISOString() };
  }

  @Post()
  async create(@Body() dto: CreatePetDto): Promise<PetResponseDto> {
    return { id: 1, name: dto.name, species: dto.species, age: dto.age, createdAt: new Date().toISOString() };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {}
}
