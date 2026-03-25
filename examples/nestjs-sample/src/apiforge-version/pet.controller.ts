import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiParam, ApiQuery, ApiResponse } from '@apiforge/nestjs';
import { CreatePetDto, UpdatePetDto, PetResponseDto, PetListResponseDto } from './pet.dto';

@ApiBearerAuth('JWT')
@ApiTags('pets')
@Controller('api/v1/pets')
export class PetController {

  @ApiOperation({ summary: '펫 목록 조회', description: '등록된 모든 펫의 목록을 조회합니다.' })
  @ApiQuery({ name: 'species', required: false, description: '종류로 필터링', enum: ['dog', 'cat', 'bird', 'fish'] })
  @ApiQuery({ name: 'limit', required: false, description: '최대 결과 수', type: Number })
  @ApiOkResponse({ type: PetListResponseDto, description: '펫 목록' })
  @Get()
  async findAll(@Query('species') species?: string, @Query('limit') limit?: number): Promise<PetListResponseDto> {
    return { items: [], total: 0 };
  }

  @ApiOperation({ summary: '펫 상세 조회', description: '특정 펫의 상세 정보를 조회합니다.' })
  @ApiParam({ name: 'id', description: '펫 ID', type: Number })
  @ApiOkResponse({ type: PetResponseDto, description: '펫 상세 정보' })
  @ApiResponse({ status: 404, description: '펫을 찾을 수 없음' })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<PetResponseDto> {
    return { id, name: 'Buddy', species: 'dog', createdAt: new Date().toISOString() };
  }

  @ApiOperation({ summary: '펫 등록', description: '새로운 펫을 등록합니다.' })
  @ApiCreatedResponse({ type: PetResponseDto, description: '생성된 펫 정보' })
  @ApiResponse({ status: 400, description: '잘못된 요청' })
  @Post()
  async create(@Body() dto: CreatePetDto): Promise<PetResponseDto> {
    return { id: 1, name: dto.name, species: dto.species, age: dto.age, createdAt: new Date().toISOString() };
  }

  @ApiOperation({ summary: '펫 정보 수정' })
  @ApiParam({ name: 'id', description: '펫 ID', type: Number })
  @ApiOkResponse({ type: PetResponseDto })
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePetDto): Promise<PetResponseDto> {
    return { id, name: dto.name || 'Buddy', species: dto.species || 'dog', createdAt: new Date().toISOString() };
  }

  @ApiOperation({ summary: '펫 삭제' })
  @ApiParam({ name: 'id', description: '펫 ID', type: Number })
  @ApiResponse({ status: 204, description: '삭제 완료' })
  @ApiResponse({ status: 404, description: '펫을 찾을 수 없음' })
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {}
}
