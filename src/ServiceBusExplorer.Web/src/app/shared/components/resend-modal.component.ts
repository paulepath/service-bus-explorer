import { Component, EventEmitter, Input, Output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { StateService } from '../../core/services/state.service';
import {
  ServiceBusMessageDto,
  ResendDeadLetterRequest,
  SelectedEntity
} from '../../core/models/service-bus.models';

@Component({
  selector: 'app-resend-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>
            <span class="badge badge-amber">DEAD LETTER RESEND</span>
            <span style="margin-left: 8px;">Sequence #{{ message.sequenceNumber }}</span>
          </h3>
          <button class="btn btn-secondary btn-sm" (click)="close()">✕</button>
        </div>

        <div class="modal-body">
          <div class="info-callout">
            <div class="callout-title">Dead Letter Information</div>
            <div><strong>Reason:</strong> {{ message.deadLetterReason || 'N/A' }}</div>
            <div><strong>Error Description:</strong> {{ message.deadLetterErrorDescription || 'N/A' }}</div>
          </div>

          <div class="form-group">
            <label>Destination Queue / Topic</label>
            <input
              type="text"
              [(ngModel)]="destination"
              class="form-input"
              placeholder="Leave empty to send back to source queue" />
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="removeOriginal" />
              <span><strong>Remove original message from DLQ</strong> (Guaranteed 2-phase settlement: only completes after send succeeds)</span>
            </label>
          </div>

          <div class="form-group">
            <label>Message Payload Preview (Read-only)</label>
            <textarea readonly rows="6" class="form-textarea" [value]="message.textBody || ''"></textarea>
          </div>

          @if (errorMessage()) {
            <div class="error-banner">{{ errorMessage() }}</div>
          }
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="close()">Cancel</button>
          <button class="btn btn-primary" (click)="resend()" [disabled]="isSending()">
            {{ isSending() ? 'Processing...' : (removeOriginal ? 'Resend & Remove Original' : 'Resend (Keep Original in DLQ)') }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .info-callout {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid var(--accent-warning);
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .callout-title {
      font-weight: 600;
      color: #fbbf24;
      margin-bottom: 4px;
    }
    .form-group {
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .checkbox-label {
      display: flex;
      align-items: flex-start;
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
export class ResendModalComponent {
  @Input() entity!: SelectedEntity;
  @Input() message!: ServiceBusMessageDto;
  @Output() closed = new EventEmitter<void>();
  @Output() completed = new EventEmitter<void>();

  private api = inject(ApiService);
  private state = inject(StateService);

  destination = '';
  removeOriginal = true;
  isSending = signal<boolean>(false);
  errorMessage = signal<string>('');

  close() {
    this.closed.emit();
  }

  resend() {
    const conn = this.state.selectedConnection();
    if (!conn || this.message.sequenceNumber === undefined) return;

    this.isSending.set(true);
    this.errorMessage.set('');

    const request: ResendDeadLetterRequest = {
      sequenceNumber: this.message.sequenceNumber,
      targetQueueOrTopic: this.destination.trim() || undefined,
      removeOriginal: this.removeOriginal
    };

    this.api.resendDeadLetter(conn.id, this.entity, request).subscribe({
      next: (res) => {
        this.isSending.set(false);
        if (res.success) {
          this.completed.emit();
          this.close();
        } else {
          this.errorMessage.set(res.errorMessage || 'Resend failed.');
        }
      },
      error: (err) => {
        this.isSending.set(false);
        this.errorMessage.set(err.message || 'Failed to resend DLQ message.');
      }
    });
  }
}
