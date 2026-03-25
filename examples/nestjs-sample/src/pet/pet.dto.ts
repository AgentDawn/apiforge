import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePetDto {
  @ApiProperty({ description: '펫 이름', example: 'Buddy' })
  name: string;

  @ApiProperty({ description: '펫 종류', enum: ['dog', 'cat', 'bird', 'fish'] })
  species: string;

  @ApiPropertyOptional({ description: '펫 나이', example: 3 })
  age?: number;

  @ApiPropertyOptional({ description: '태그 목록', type: [String], example: ['friendly', 'trained'] })
  tags?: string[];
}

export class UpdatePetDto {
  @ApiPropertyOptional({ description: '펫 이름' })
  name?: string;

  @ApiPropertyOptional({ description: '펫 종류', enum: ['dog', 'cat', 'bird', 'fish'] })
  species?: string;

  @ApiPropertyOptional({ description: '펫 나이' })
  age?: number;
}

export class PetResponseDto {
  @ApiProperty({ description: '펫 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '펫 이름' })
  name: string;

  @ApiProperty({ description: '펫 종류' })
  species: string;

  @ApiPropertyOptional({ description: '펫 나이' })
  age?: number;

  @ApiProperty({ description: '등록일' })
  createdAt: string;
}

export class PetListResponseDto {
  @ApiProperty({ type: [PetResponseDto] })
  items: PetResponseDto[];

  @ApiProperty({ description: '전체 개수' })
  total: number;
}
