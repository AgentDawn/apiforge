import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiParam, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CreateUserDto, UserResponseDto, LoginDto, TokenResponseDto } from './user.dto';

@ApiTags('users')
@Controller('api/v1/users')
export class UserController {

  @ApiOperation({ summary: '회원가입' })
  @ApiCreatedResponse({ type: UserResponseDto, description: '생성된 사용자 정보' })
  @ApiResponse({ status: 409, description: '이미 존재하는 이메일' })
  @Post('register')
  async register(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return { id: 1, email: dto.email, displayName: dto.displayName, createdAt: new Date().toISOString() };
  }

  @ApiOperation({ summary: '로그인 (Form URL-Encoded)' })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: TokenResponseDto, description: 'JWT 토큰' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<TokenResponseDto> {
    return { accessToken: 'eyJ...', expiresIn: 3600 };
  }

  @ApiOperation({ summary: '회원가입 (JSON + Form)' })
  @ApiConsumes('application/json', 'application/x-www-form-urlencoded')
  @ApiBody({ type: CreateUserDto })
  @ApiCreatedResponse({ type: UserResponseDto, description: '생성된 사용자 정보 (multiple content types)' })
  @Post('register-multi')
  async registerMulti(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return { id: 2, email: dto.email, displayName: dto.displayName, createdAt: new Date().toISOString() };
  }

  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: '내 정보 조회' })
  @ApiOkResponse({ type: UserResponseDto })
  @Get('me')
  async getMe(): Promise<UserResponseDto> {
    return { id: 1, email: 'user@example.com', displayName: 'John', createdAt: new Date().toISOString() };
  }

  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: '사용자 조회' })
  @ApiParam({ name: 'id', description: '사용자 ID' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiResponse({ status: 404, description: '사용자를 찾을 수 없음' })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return { id, email: 'user@example.com', displayName: 'John', createdAt: new Date().toISOString() };
  }
}
