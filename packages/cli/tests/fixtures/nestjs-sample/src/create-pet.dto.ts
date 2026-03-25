import { ApiProperty } from '@nestjs/swagger';

export class CreatePetDto {
  @ApiProperty({ example: 'Buddy', description: 'Name of the pet' })
  name: string;

  @ApiProperty({ example: 'dog', description: 'Species of the pet' })
  species: string;

  @ApiProperty({ example: 3, description: 'Age in years', required: false })
  age?: number;
}

export class Pet {
  @ApiProperty({ example: 1, description: 'Unique pet ID' })
  id: number;

  @ApiProperty({ example: 'Buddy', description: 'Name of the pet' })
  name: string;

  @ApiProperty({ example: 'dog', description: 'Species of the pet' })
  species: string;

  @ApiProperty({ example: 3, description: 'Age in years', required: false })
  age?: number;
}
