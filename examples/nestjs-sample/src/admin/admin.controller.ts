import { Controller, Post, Body, Param, NotFoundException } from '@nestjs/common';

@Controller('admin')
export class AdminController {
  private users = [
    { id: '1', email: 'admin@test.com', name: 'Admin User', role: 'admin' },
    { id: '2', email: 'user@test.com', name: 'Regular User', role: 'user' },
    { id: '3', email: 'viewer@test.com', name: 'Viewer', role: 'viewer' },
  ];

  @Post('users/search')
  searchUsers(@Body('query') query: string) {
    const q = (query || '').toLowerCase();
    const results = this.users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
    return { users: results };
  }

  @Post('users/:id/token')
  generateToken(@Param('id') id: string) {
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = Buffer.from(JSON.stringify(payload)).toString('base64');
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${token}.demo-signature`;
    return {
      token: jwt,
      user: { id: user.id, email: user.email, role: user.role },
      expiresIn: 3600,
    };
  }
}
