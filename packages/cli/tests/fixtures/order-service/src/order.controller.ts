import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BadRequestException, NotFoundException } from '@nestjs/common';

@ApiTags('orders')
@Controller('orders')
export class OrderController {
  @Get()
  @ApiOperation({ summary: 'List all orders' })
  async findAll() {
    return [];
  }

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  async create(@Body() dto: any) {
    if (!dto.productId) {
      throw new BadRequestException('productId is required');
    }
    if (!dto.quantity || dto.quantity <= 0) {
      throw new BadRequestException('quantity must be a positive number');
    }
    return { id: 1, ...dto };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  async findOne(@Param('id') id: string) {
    const numId = Number(id);
    if (isNaN(numId)) {
      throw new BadRequestException('Invalid order ID');
    }
    const order = null;
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }
}
