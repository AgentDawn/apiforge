import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class UserService {
  async validateToken(token: string) {
    if (!token) {
      throw new UnauthorizedException('JWT token is required');
    }
    if (token === 'expired') {
      throw new UnauthorizedException('Token has expired');
    }
  }

  async checkAdmin(userId: string) {
    const isAdmin = false;
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
  }
}
