import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { StateService } from '../../core/services/state.service';
import { ConnectionProfile } from '../../core/models/service-bus.models';

@Component({
  selector: 'app-connect-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>
            <span class="badge badge-purple">CONNECT</span>
            <span style="margin-left: 8px;">Add Service Bus Connection</span>
          </h3>
          <button class="btn btn-secondary btn-sm" (click)="close()">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>Connection Name / Display Label</label>
            <input type="text" [(ngModel)]="name" class="form-input" placeholder="e.g. Orders Production or Local Dev" />
          </div>

          <div class="form-group">
            <label>Connection Type</label>
            <select [(ngModel)]="type" class="form-select">
              <option value="LocalEmulator">Local Emulator (WSL / Docker)</option>
              <option value="AzureConnectionString">Azure Connection String (SAS)</option>
              <option value="AzureCredential">Azure Identity / DefaultAzureCredential</option>
            </select>
          </div>

          @if (type !== 'AzureCredential') {
            <div class="form-group">
              <label>Connection String</label>
              <textarea
                [(ngModel)]="connectionString"
                rows="3"
                class="form-textarea"
                placeholder="Endpoint=sb://...;SharedAccessKeyName=...;SharedAccessKey=..."></textarea>
            </div>
          } @else {
            <div class="form-group">
              <label>Fully Qualified Namespace</label>
              <input type="text" [(ngModel)]="namespace" class="form-input" placeholder="e.g. my-namespace.servicebus.windows.net" />
            </div>
          }

          @if (errorMessage()) {
            <div class="error-banner">{{ errorMessage() }}</div>
          }
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="close()">Cancel</button>
          <button class="btn btn-primary" (click)="save()" [disabled]="isSaving() || !name">
            {{ isSaving() ? 'Saving...' : 'Connect' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .form-group {
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 4px;
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
export class ConnectModalComponent {
  @Output() closed = new EventEmitter<void>();
  @Output() connected = new EventEmitter<ConnectionProfile>();

  private api = inject(ApiService);
  private state = inject(StateService);

  name = '';
  type: 'LocalEmulator' | 'AzureConnectionString' | 'AzureCredential' = 'LocalEmulator';
  connectionString = 'Endpoint=sb://127.0.0.1:5672;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;';
  namespace = '';

  isSaving = signal<boolean>(false);
  errorMessage = signal<string>('');

  close() {
    this.closed.emit();
  }

  save() {
    this.isSaving.set(true);
    this.errorMessage.set('');

    const profile: Partial<ConnectionProfile> = {
      name: this.name.trim(),
      type: this.type,
      connectionString: this.type !== 'AzureCredential' ? this.connectionString.trim() : undefined,
      fullyQualifiedNamespace: this.type === 'AzureCredential' ? this.namespace.trim() : undefined
    };

    this.api.addConnection(profile).subscribe({
      next: (created) => {
        this.isSaving.set(false);
        this.state.connections.update(list => [...list, created]);
        this.state.selectConnection(created);
        this.connected.emit(created);
        this.close();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(err.message || 'Failed to add connection.');
      }
    });
  }
}
