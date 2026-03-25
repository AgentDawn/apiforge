import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiBody } from '@nestjs/swagger';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { CreatePetDto, Pet } from './create-pet.dto';

@ApiTags('pets')
@Controller('pets')
export class PetController {
  @Get()
  @ApiOperation({ summary: 'Get all pets' })
  @ApiOkResponse({ description: 'List of pets', type: [Pet] })
  async findAll(@Query('species') species?: string) {
    if (species && species.length > 100) {
      throw new BadRequestException('Species filter too long');
    }
    return [];
  }

  @Post()
  @ApiOperation({ summary: 'Create a new pet' })
  @ApiBody({ type: CreatePetDto })
  @ApiCreatedResponse({ description: 'Pet created successfully', type: Pet })
  async create(@Body() dto: CreatePetDto) {
    if (!dto.name) {
      throw new BadRequestException('name is required');
    }
    if (!dto.species) {
      throw new BadRequestException('species is required');
    }
    const existing = false; // simulated
    if (existing) {
      throw new ConflictException('A pet with this name already exists');
    }
    return { id: 1, ...dto };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const numId = Number(id);
    if (isNaN(numId) || numId <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }
    const pet = null; // simulated
    if (!pet) {
      throw new NotFoundException(`Pet with ID ${id} not found`);
    }
    return pet;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const numId = Number(id);
    if (isNaN(numId)) {
      throw new BadRequestException('Invalid pet ID');
    }
    const pet = null; // simulated
    if (!pet) {
      throw new NotFoundException('Pet not found');
    }
    return { deleted: true };
  }
}
