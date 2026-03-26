import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UploadedFile, UseInterceptors, UseGuards, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiParam, ApiQuery, ApiResponse, ApiConsumes, ApiBody, ApiExcludeEndpoint } from '@nestjs/swagger';
import { CreatePetDto, UpdatePetDto, PetResponseDto, PetListResponseDto } from './pet.dto';

@ApiBearerAuth('JWT')
@ApiTags('pets')
@Controller('api/v1/pets')
export class PetController {

  private pets = [
    { id: 1, name: 'Buddy', species: 'dog', createdAt: '2024-01-01' },
    { id: 2, name: 'Whiskers', species: 'cat', createdAt: '2024-01-02' },
  ];

  @ApiOperation({ summary: '펫 목록 조회', description: '등록된 모든 펫의 목록을 조회합니다.' })
  @ApiQuery({ name: 'species', required: false, description: '종류로 필터링', enum: ['dog', 'cat', 'bird', 'fish'] })
  @ApiQuery({ name: 'limit', required: false, description: '최대 결과 수', type: Number })
  @ApiOkResponse({ type: PetListResponseDto, description: '펫 목록' })
  @Get()
  async findAll(
    @Query('species') species?: string,
    @Query('limit') limit?: number,
  ): Promise<PetListResponseDto> {
    if (species && species.length > 50) {
      throw new BadRequestException('Species filter too long');
    }
    return { items: this.pets as any, total: this.pets.length };
  }

  @ApiOperation({ summary: '펫 상세 조회', description: '특정 펫의 상세 정보를 조회합니다.' })
  @ApiParam({ name: 'id', description: '펫 ID', type: Number })
  @ApiOkResponse({ type: PetResponseDto, description: '펫 상세 정보' })
  @ApiResponse({ status: 404, description: '펫을 찾을 수 없음' })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<PetResponseDto> {
    if (id <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }
    const pet = this.pets.find(p => p.id === id);
    if (!pet) {
      throw new NotFoundException(`Pet with ID ${id} not found`);
    }
    return pet as any;
  }

  @ApiOperation({ summary: '펫 등록', description: '새로운 펫을 등록합니다.' })
  @ApiCreatedResponse({ type: PetResponseDto, description: '생성된 펫 정보' })
  @ApiResponse({ status: 400, description: '잘못된 요청' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT token missing or invalid' })
  @UseGuards(JwtGuard)
  @Post()
  async create(@Body() dto: CreatePetDto): Promise<PetResponseDto> {
    if (!dto.name) {
      throw new BadRequestException('name is required');
    }
    if (!dto.species) {
      throw new BadRequestException('species is required');
    }
    const existing = this.pets.find(p => p.name === dto.name);
    if (existing) {
      throw new ConflictException('A pet with this name already exists');
    }
    const pet = { id: this.pets.length + 1, name: dto.name, species: dto.species, age: dto.age, createdAt: new Date().toISOString() };
    this.pets.push(pet);
    return pet as any;
  }

  @ApiOperation({ summary: '펫 정보 수정' })
  @ApiParam({ name: 'id', description: '펫 ID', type: Number })
  @ApiOkResponse({ type: PetResponseDto })
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePetDto): Promise<PetResponseDto> {
    const pet = this.pets.find(p => p.id === id);
    if (!pet) {
      throw new NotFoundException('Pet not found');
    }
    return { ...pet, ...dto } as any;
  }

  @ApiOperation({ summary: '펫 아바타 업로드', description: '펫의 프로필 이미지를 업로드합니다.' })
  @ApiParam({ name: 'id', description: '펫 ID', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '이미지 파일' },
        description: { type: 'string', description: '이미지 설명' },
      },
    },
  })
  @ApiOkResponse({ description: '업로드 완료', schema: { type: 'object', properties: { url: { type: 'string' } } } })
  @Post(':id/avatar')
  async uploadAvatar(@Param('id', ParseIntPipe) id: number, @Body() body: any): Promise<{ url: string }> {
    return { url: `https://cdn.example.com/pets/${id}/avatar.jpg` };
  }

  @ApiOperation({ summary: '펫 삭제' })
  @ApiParam({ name: 'id', description: '펫 ID', type: Number })
  @ApiResponse({ status: 204, description: '삭제 완료' })
  @ApiResponse({ status: 404, description: '펫을 찾을 수 없음' })
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    if (id <= 0) {
      throw new BadRequestException('Invalid pet ID');
    }
    const idx = this.pets.findIndex(p => p.id === id);
    if (idx === -1) {
      throw new NotFoundException('Pet not found');
    }
    this.pets.splice(idx, 1);
  }

  // This should be HIDDEN from the spec
  @Get('_internal/stats')
  @ApiExcludeEndpoint()
  getInternalStats() {
    return { totalPets: 42 };
  }
}
