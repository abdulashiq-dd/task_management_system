import { Component, computed, input } from '@angular/core';
import { TaskStatus } from '../../../core/models/task.model';

@Component({
  selector: 'app-status-badge',
  template: `<span class="status-badge" [attr.data-status]="status()">{{ label() || labelText() }}</span>`,
  standalone: true,
  styles: `
    .status-badge {
      display: inline-flex;
      border-radius: 999px;
      padding: 0.25rem 0.625rem;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: capitalize;
    }

    [data-status='pending'] { background: #fef3c7; color: #92400e; }
    [data-status='in_progress'] { background: #dbeafe; color: #1e40af; }
    [data-status='completed'] { background: #dcfce7; color: #166534; }
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<TaskStatus>();
  readonly label = input<string>();
  readonly labelText = computed(() => this.status().replace('_', ' '));
}
