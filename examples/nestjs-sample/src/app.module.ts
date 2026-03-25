import { Module } from '@nestjs/common';
import { PetModule } from './pet/pet.module';
import { UserModule } from './user/user.module';
import { GrpcModule } from './grpc/grpc.module';
import { AdminModule } from './admin/admin.module';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [PetModule, UserModule, GrpcModule, AdminModule, InternalModule],
})
export class AppModule {}
