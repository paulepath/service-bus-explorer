import { Component, EventEmitter, Input, Output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { StateService } from '../../core/services/state.service';
import {
  CreateQueueRequest,
  CreateTopicRequest,
  CreateSubscriptionRequest
} from '../../core/models/service-bus.models';

export type EntityCreationType = 'queue' | 'topic' | 'subscription';

@Component({
  selector: 'app-create-entity-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>
            <span class="badge" [class.badge-blue]="entityType === 'queue'" [class.badge-purple]="entityType === 'topic' || entityType === 'subscription'">
              CREATE {{ entityType.toUpperCase() }}
            </span>
            @if (entityType === 'subscription' && parentTopicName) {
              <span style="margin-left: 8px; font-weight: normal; color: var(--text-muted)">for topic {{ parentTopicName }}</span>
            }
          </h3>
          <button class="btn btn-secondary btn-sm" (click)="close()">✕</button>
        </div>

        <div class="modal-body">
          <!-- Queue Form -->
          @if (entityType === 'queue') {
            <div class="form-section">
              <label>Queue Name *</label>
              <input
                type="text"
                [(ngModel)]="name"
                class="form-input"
                placeholder="e.g. orders-processing"
                autofocus />
            </div>

            <div class="grid-2">
              <div class="form-section">
                <label>Max Delivery Count</label>
                <input type="number" [(ngModel)]="maxDeliveryCount" class="form-input" min="1" max="100" />
              </div>
              <div class="form-section">
                <label>Lock Duration (Seconds)</label>
                <input type="number" [(ngModel)]="lockDurationSeconds" class="form-input" min="5" max="300" />
              </div>
            </div>

            <div class="form-checkboxes">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="requiresSession" />
                <span>Enable Sessions (FIFO / Ordered processing)</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="deadLetterOnExpiration" />
                <span>Move expired messages to Dead-Letter Queue</span>
              </label>
            </div>
          }

          <!-- Topic Form -->
          @if (entityType === 'topic') {
            <div class="form-section">
              <label>Topic Name *</label>
              <input
                type="text"
                [(ngModel)]="name"
                class="form-input"
                placeholder="e.g. order-events"
                autofocus />
            </div>

            <div class="form-section">
              <label>Max Size (Megabytes)</label>
              <select [(ngModel)]="maxSizeMb" class="form-select">
                <option [value]="1024">1,024 MB (1 GB)</option>
                <option [value]="2048">2,048 MB (2 GB)</option>
                <option [value]="5120">5,120 MB (5 GB)</option>
              </select>
            </div>
          }

          <!-- Subscription Form -->
          @if (entityType === 'subscription') {
            <div class="form-section">
              <label>Subscription Name *</label>
              <input
                type="text"
                [(ngModel)]="name"
                class="form-input"
                placeholder="e.g. invoice-service-sub"
                autofocus />
            </div>

            <div class="grid-2">
              <div class="form-section">
                <label>Max Delivery Count</label>
                <input type="number" [(ngModel)]="maxDeliveryCount" class="form-input" min="1" max="100" />
              </div>
              <div class="form-section">
                <label>Lock Duration (Seconds)</label>
                <input type="number" [(ngModel)]="lockDurationSeconds" class="form-input" min="5" max="300" />
              </div>
            </div>

            <div class="form-checkboxes">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="requiresSession" />
                <span>Enable Sessions</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="deadLetterOnExpiration" />
                <span>Move expired messages to Dead-Letter Queue</span>
              </label>
            </div>
          }

          @if (errorMessage()) {
            <div class="error-banner">{{ errorMessage() }}</div>
          }
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="close()">Cancel</button>
          <button class="btn btn-primary" (click)="create()" [disabled]="isCreating() || !name.trim()">
            {{ isCreating() ? 'Creating...' : 'Create ' + entityType }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .form-section {
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 4px;
      font-weight: 500;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .form-checkboxes {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-main);
      cursor: pointer;
    }
    .error-banner {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--accent-danger);
      color: #fca5a5;
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-top: 10px;
    }
  `]
})
export class CreateEntityModalComponent {
  @Input() entityType: EntityCreationType = 'queue';
  @Input() parentTopicName?: string;
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  private api = inject(ApiService);
  private state = inject(StateService);

  name = '';
  maxDeliveryCount = 10;
  lockDurationSeconds = 60;
  requiresSession = false;
  deadLetterOnExpiration = false;
  maxSizeMb = 1024;

  isCreating = signal<boolean>(false);
  errorMessage = signal<string>('');

  close() {
    this.closed.emit();
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  create() {
    const conn = this.state.selectedConnection();
    if (!conn || !this.name.trim()) return;

    this.isCreating.set(true);
    this.errorMessage.set('');

    const lockDurationStr = this.formatDuration(this.lockDurationSeconds);

    if (this.entityType === 'queue') {
      const req: CreateQueueRequest = {
        name: this.name.trim(),
        maxDeliveryCount: this.maxDeliveryCount,
        lockDuration: lockDurationStr,
        requiresSession: this.requiresSession,
        deadLetteringOnMessageExpiration: this.deadLetterOnExpiration
      };

      this.api.createQueue(conn.id, req).subscribe({
        next: () => {
          this.isCreating.set(false);
          this.created.emit();
          this.close();
        },
        error: (err) => {
          this.isCreating.set(false);
          this.errorMessage.set(err.message || 'Failed to create queue.');
        }
      });
    } else if (this.entityType === 'topic') {
      const req: CreateTopicRequest = {
        name: this.name.trim(),
        maxSizeInMegabytes: this.maxSizeMb
      };

      this.api.createTopic(conn.id, req).subscribe({
        next: () => {
          this.isCreating.set(false);
          this.created.emit();
          this.close();
        },
        error: (err) => {
          this.isCreating.set(false);
          this.errorMessage.set(err.message || 'Failed to create topic.');
        }
      });
    } else if (this.entityType === 'subscription' && this.parentTopicName) {
      const req: CreateSubscriptionRequest = {
        subscriptionName: this.name.trim(),
        maxDeliveryCount: this.maxDeliveryCount,
        lockDuration: lockDurationStr,
        requiresSession: this.requiresSession,
        deadLetteringOnMessageExpiration: this.deadLetterOnExpiration
      };

      this.api.createSubscription(conn.id, this.parentTopicName, req).subscribe({
        next: () => {
          this.isCreating.set(false);
          this.created.emit();
          this.close();
        },
        error: (err) => {
          this.isCreating.set(false);
          this.errorMessage.set(err.message || 'Failed to create subscription.');
        }
      });
    }
  }
}
