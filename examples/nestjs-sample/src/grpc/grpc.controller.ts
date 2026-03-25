import { Controller, Post, Req, Res } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Request, Response } from 'express';

interface Pet {
  id: string;
  name: string;
  status: string;
  tags: string[];
}

interface Order {
  id: string;
  pet_id: string;
  status: string;
}

@Controller()
export class GrpcController {
  private pets: Pet[] = [
    { id: '1', name: 'Buddy', status: 'PET_STATUS_AVAILABLE', tags: ['friendly'] },
    { id: '2', name: 'Max', status: 'PET_STATUS_AVAILABLE', tags: ['playful'] },
  ];
  private nextPetId = 3;
  private nextOrderId = 100;

  // ─── Real gRPC methods (proto-based, port 50051) ───────

  @GrpcMethod('PetService', 'GetPet')
  grpcGetPet(data: { id: string }): Pet {
    return this.getPetById(data.id);
  }

  @GrpcMethod('PetService', 'AddPet')
  grpcAddPet(data: { name: string; status: string; tags: string[] }): Pet {
    return this.addNewPet(data);
  }

  @GrpcMethod('PetService', 'ListPets')
  grpcListPets(data: { limit: number }): { pets: Pet[]; total: number } {
    return this.listAllPets(data.limit);
  }

  @GrpcMethod('StoreService', 'PlaceOrder')
  grpcPlaceOrder(data: { pet_id: string; quantity: number }): Order {
    return this.createOrder(data.pet_id);
  }

  // ─── HTTP gRPC-Web endpoints (JSON-over-HTTP, port 3001) ───

  @Post('petstore.v1.PetService/GetPet')
  httpGetPet(@Req() req: Request, @Res() res: Response) {
    const data = req.body || {};
    res.status(200).json(this.getPetById(data.id));
  }

  @Post('petstore.v1.PetService/AddPet')
  httpAddPet(@Req() req: Request, @Res() res: Response) {
    const data = req.body || {};
    res.status(200).json(this.addNewPet(data));
  }

  @Post('petstore.v1.PetService/ListPets')
  httpListPets(@Req() req: Request, @Res() res: Response) {
    const data = req.body || {};
    res.status(200).json(this.listAllPets(data.limit));
  }

  @Post('petstore.v1.StoreService/PlaceOrder')
  httpPlaceOrder(@Req() req: Request, @Res() res: Response) {
    const data = req.body || {};
    res.status(200).json(this.createOrder(data.pet_id));
  }

  // ─── Shared logic ──────────────────────────────────────

  private getPetById(id: string): Pet {
    const pet = this.pets.find((p) => p.id === id);
    if (pet) return pet;
    return { id: id || '0', name: 'Unknown', status: 'PET_STATUS_UNSPECIFIED', tags: [] };
  }

  private addNewPet(data: { name?: string; status?: string; tags?: string[] }): Pet {
    const pet: Pet = {
      id: String(this.nextPetId++),
      name: data.name || 'NewPet',
      status: data.status || 'PET_STATUS_AVAILABLE',
      tags: data.tags || [],
    };
    this.pets.push(pet);
    return pet;
  }

  private listAllPets(limit?: number): { pets: Pet[]; total: number } {
    const l = limit > 0 ? limit : this.pets.length;
    return { pets: this.pets.slice(0, l), total: this.pets.length };
  }

  private createOrder(petId?: string): Order {
    return {
      id: String(this.nextOrderId++),
      pet_id: petId || '1',
      status: 'ORDER_STATUS_PLACED',
    };
  }
}
