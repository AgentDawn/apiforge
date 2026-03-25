import { Module } from '@nestjs/common';
import { PetModule } from './pet.module';
import { UserModule } from './user.module';

@Module({
  imports: [PetModule, UserModule],
})
export class AppModule {}
