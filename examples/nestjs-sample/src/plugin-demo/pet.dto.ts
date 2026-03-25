// NO @ApiProperty decorators - the plugin will inject them automatically!
export class CreatePetDto {
  name: string;
  species: string;
  age?: number;
  tags?: string[];
}

export class PetResponseDto {
  id: number;
  name: string;
  species: string;
  age?: number;
  createdAt: string;
}

export class PetListResponseDto {
  items: PetResponseDto[];
  total: number;
}
