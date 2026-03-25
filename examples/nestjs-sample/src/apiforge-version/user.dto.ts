import { ApiProperty, ApiPropertyOptional } from '@apiforge/nestjs';

export class CreateUserDto {
  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  email: string;

  @ApiProperty({ description: '비밀번호', minLength: 8 })
  password: string;

  @ApiProperty({ description: '사용자 이름', example: 'John Doe' })
  displayName: string;
}

export class UserResponseDto {
  @ApiProperty({ description: '사용자 ID' })
  id: number;

  @ApiProperty({ description: '이메일' })
  email: string;

  @ApiProperty({ description: '사용자 이름' })
  displayName: string;

  @ApiPropertyOptional({ description: '프로필 이미지 URL' })
  avatarUrl?: string;

  @ApiProperty({ description: '가입일' })
  createdAt: string;
}

export class LoginDto {
  @ApiProperty({ description: '이메일' })
  email: string;

  @ApiProperty({ description: '비밀번호' })
  password: string;
}

export class TokenResponseDto {
  @ApiProperty({ description: 'JWT 액세스 토큰' })
  accessToken: string;

  @ApiProperty({ description: '토큰 만료 시간 (초)' })
  expiresIn: number;
}
