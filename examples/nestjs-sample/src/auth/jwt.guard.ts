import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    if (!token || token.length < 10) {
      throw new UnauthorizedException('Invalid token');
    }

    // Decode the payload (base64) - simple validation, not cryptographic
    try {
      const parts = token.split('.');
      if (parts.length < 2) throw new Error('Invalid token format');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      request.user = payload;
    } catch {
      throw new UnauthorizedException('Malformed token');
    }

    return true;
  }
}
