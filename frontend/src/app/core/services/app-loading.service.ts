import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AppLoadingService {
  private readonly readyState = signal(false);
  readonly ready = this.readyState.asReadonly();

  complete(): void {
    this.readyState.set(true);
  }
}
