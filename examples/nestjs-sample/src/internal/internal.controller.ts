import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiExcludeEndpoint, ApiBearerAuth } from '@nestjs/swagger';

@Controller('internal')
@ApiTags('Internal')
@ApiBearerAuth('JWT')
export class InternalController {

  // This should appear in the spec
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ description: 'Service is healthy' })
  healthCheck() {
    return { status: 'ok' };
  }

  // This should be HIDDEN from the spec
  @Get('debug')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Debug info - internal only' })
  debugInfo() {
    return { debug: true, uptime: process.uptime() };
  }

  // This should be HIDDEN from the spec
  @Post('cache/clear')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Clear cache - internal only' })
  clearCache() {
    return { cleared: true };
  }

  // This should appear in the spec
  @Get('version')
  @ApiOperation({ summary: 'Get API version' })
  @ApiOkResponse({ description: 'API version info' })
  getVersion() {
    return { version: '1.0.0' };
  }
}
