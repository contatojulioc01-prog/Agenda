import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostBinding, HostListener, OnDestroy, Output, inject } from '@angular/core';

@Component({
  selector: 'app-livro-abrindo',
  standalone: true,
  templateUrl: './livro-abrindo.component.html',
  styleUrl: './livro-abrindo.component.scss',
})
export class LivroAbrindoComponent implements AfterViewInit, OnDestroy {
  @Output() readonly opened = new EventEmitter<void>();
  @HostBinding('class.opening') opening = false;
  @HostBinding('class.positioned') positioned = false;
  @HostBinding('class.dragging') dragging = false;
  @HostBinding('style.left.px') left: number | null = null;
  @HostBinding('style.top.px') top: number | null = null;

  src = 'assets/livro-doce-brinquedo.svg#db-closed';
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly positionStorageKey = 'agenda-ai-assistant-position';
  private openingTimer?: number;
  private activePointerId?: number;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private positionStartX = 0;
  private positionStartY = 0;
  private dragMoved = false;
  private suppressClick = false;

  constructor() {
    this.restorePosition();
  }

  ngAfterViewInit(): void {
    this.restorePosition();
  }

  replay(): void {
    this.src = `assets/livro-doce-brinquedo.svg?t=${Date.now()}`;
  }

  openAssistant(): void {
    if (this.opening) return;
    const host = this.element.nativeElement;
    const rect = host.getBoundingClientRect();

    // Salvar a posição atual antes de iniciar a animação
    if (this.left === null || this.top === null) {
      this.left = rect.left;
      this.top = rect.top;
      this.positioned = true;
    }
    this.persistPosition();

    // Calcular o deslocamento exato do centro do livro até o centro do viewport
    const currentCenterX = rect.left + rect.width / 2;
    const currentCenterY = rect.top + rect.height / 2;
    const targetCenterX = window.innerWidth / 2;
    const targetCenterY = window.innerHeight / 2;
    const deltaX = Math.round(targetCenterX - currentCenterX);
    const deltaY = Math.round(targetCenterY - currentCenterY);

    host.style.setProperty('--move-x', `${deltaX}px`);
    host.style.setProperty('--move-y', `${deltaY}px`);

    this.replay();
    this.opening = true;
    this.cdr.detectChanges();

    const openingDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 750;
    this.openingTimer = window.setTimeout(() => {
      this.opened.emit();
    }, openingDuration);
  }

  onPointerDown(event: PointerEvent): void {
    if (this.opening || event.button !== 0) return;
    const rect = this.element.nativeElement.getBoundingClientRect();
    this.activePointerId = event.pointerId;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.positionStartX = rect.left;
    this.positionStartY = rect.top;
    this.dragMoved = false;
    this.dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId || this.opening) return;
    const deltaX = event.clientX - this.pointerStartX;
    const deltaY = event.clientY - this.pointerStartY;
    if (!this.dragMoved && Math.hypot(deltaX, deltaY) < 5) return;
    this.dragMoved = true;
    event.preventDefault();
    this.setPosition(this.positionStartX + deltaX, this.positionStartY + deltaY);
  }

  onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    this.activePointerId = undefined;
    this.dragging = false;
    if (!this.dragMoved) return;
    this.suppressClick = true;
    this.dragMoved = false;
    this.persistPosition();
    window.setTimeout(() => { this.suppressClick = false; }, 0);
  }

  onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    this.activePointerId = undefined;
    this.dragging = false;
    if (this.dragMoved) this.persistPosition();
    this.dragMoved = false;
  }

  onClick(event: MouseEvent): void {
    if (this.suppressClick) {
      event.preventDefault();
      return;
    }
    this.openAssistant();
  }

  @HostListener('window:resize')
  keepInsideViewport(): void {
    if (!this.positioned || this.opening || this.left === null || this.top === null) return;
    this.setPosition(this.left, this.top);
    this.persistPosition();
  }

  private setPosition(left: number, top: number): void {
    const rect = this.element.nativeElement.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    this.left = Math.min(Math.max(left, margin), maxLeft);
    this.top = Math.min(Math.max(top, margin), maxTop);
    this.positioned = true;
  }

  private moveToViewportCenter(): void {
    const host = this.element.nativeElement;
    this.left = Math.max(0, (window.innerWidth - host.offsetWidth) / 2);
    this.top = Math.max(0, (window.innerHeight - host.offsetHeight) / 2);
  }

  private persistPosition(): void {
    if (this.left === null || this.top === null) return;
    try {
      localStorage.setItem(this.positionStorageKey, JSON.stringify({ left: this.left, top: this.top }));
    } catch {}
  }

  private restorePosition(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.positionStorageKey) || 'null');
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) this.setPosition(saved.left, saved.top);
    } catch {}
  }

  ngOnDestroy(): void {
    if (this.openingTimer !== undefined) window.clearTimeout(this.openingTimer);
  }
}
