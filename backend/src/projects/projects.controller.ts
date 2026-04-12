import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateInventionDto } from './dto/update-invention.dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string) {
    return this.projectsService.delete(id);
  }

  @Put(':id/invention')
  upsertInvention(@Param('id') id: string, @Body() dto: UpdateInventionDto) {
    return this.projectsService.upsertInvention(id, dto);
  }

  @Get(':id/invention')
  getInvention(@Param('id') id: string) {
    return this.projectsService.getInvention(id);
  }
}
