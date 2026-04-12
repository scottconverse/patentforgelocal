import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export type PriorArtEvent =
  | { type: 'prior_art_start'; searchId: string }
  | { type: 'prior_art_queries'; queries: string[] }
  | { type: 'prior_art_progress'; queryIndex: number; query: string; resultCount: number }
  | { type: 'prior_art_complete'; searchId: string; totalResults: number }
  | { type: 'prior_art_error'; message: string };

@Injectable()
export class PriorArtSseService {
  private emitters = new Map<string, EventEmitter>();

  getOrCreate(projectId: string): EventEmitter {
    if (!this.emitters.has(projectId)) {
      this.emitters.set(projectId, new EventEmitter());
    }
    return this.emitters.get(projectId)!;
  }

  emit(projectId: string, event: PriorArtEvent): void {
    this.getOrCreate(projectId).emit('event', event);
  }

  cleanup(projectId: string): void {
    this.emitters.delete(projectId);
  }
}
