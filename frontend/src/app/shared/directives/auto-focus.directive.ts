import { AfterViewInit, Directive, ElementRef, inject, input } from '@angular/core';

@Directive({
  selector: '[appAutoFocus]',
  standalone: true,
})
export class AutoFocusDirective implements AfterViewInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly appAutoFocus = input(true);

  ngAfterViewInit(): void {
    if (this.appAutoFocus()) {
      this.element.nativeElement.focus();
    }
  }
}
