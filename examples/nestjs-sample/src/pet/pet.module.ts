import { Module } from '@nestjs/common';
import { PetController } from './pet.controller';

@Module({
  controllers: [PetController],
})
export class PetModule {}
