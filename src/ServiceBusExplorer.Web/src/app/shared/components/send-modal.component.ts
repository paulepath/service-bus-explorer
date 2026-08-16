import { Component, EventEmitter, Input, Output, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { StateService } from '../../core/services/state.service';
import {
  MessagePayloadFormat,
  SendMessageRequest,
  SelectedEntity
} from '../../core/models/service-bus.models';

@Component({
  selector: 'app-send-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>
            <span class="badge badge-green">SEND MESSAGE</span>
            <span style="margin-left: 8px; font-weight: normal; color: var(--text-muted)">to {{ entity.name }}</span>
          </h3>
          <button class="btn btn-secondary btn-sm" (click)="close()">✕</button>
        </div>

        <div class="modal-body">
          <!-- Body Editor -->
          <div class="form-section">
            <div class="section-title">
              <span>Message Payload</span>
              <div class="body-tools">
                <select [(ngModel)]="format" class="form-select form-select-sm" style="width: 110px;">
                  <option value="Json">JSON</option>
                  <option value="Xml">XML</option>
                  <option value="PlainText">Plain Text</option>
                  <option value="Base64">Base64</option>
                </select>
                @if (format === 'Json') {
                  <button class="btn btn-secondary btn-sm" (click)="formatJson()">Prettify JSON</button>
                }
              </div>
            </div>
            <textarea
              [(ngModel)]="body"
              rows="8"
              class="form-textarea"
              placeholder="Enter message body here..."></textarea>
          </div>

          <!-- Standard Broker Properties -->
          <div class="form-section">
            <div class="section-title">Standard Broker Properties</div>
            <div class="grid-2">
              <div>
                <label>Message ID</label>
                <input type="text" [(ngModel)]="messageId" class="form-input" placeholder="auto-generated if empty" />
              </div>
              <div>
                <label>Subject / Label</label>
                <input type="text" [(ngModel)]="subject" class="form-input" placeholder="e.g. OrderCreated" />
              </div>
              <div>
                <label>Correlation ID</label>
                <input type="text" [(ngModel)]="correlationId" class="form-input" placeholder="Optional" />
              </div>
              <div>
                <label>Content Type</label>
                <input type="text" [(ngModel)]="contentType" class="form-input" placeholder="e.g. application/json" />
              </div>
              <div>
                <label>Session ID</label>
                <input type="text" [(ngModel)]="sessionId" class="form-input" placeholder="Required for session queues" />
              </div>
              <div>
                <label>Partition Key</label>
                <input type="text" [(ngModel)]="partitionKey" class="form-input" placeholder="Optional" />
              </div>
              <div>
                <label>TTL (Time To Live in Seconds)</label>
                <input type="number" [(ngModel)]="ttlSeconds" class="form-input" placeholder="e.g. 3600" />
              </div>
              <div>
                <label>Schedule Enqueue (UTC)</label>
                <input type="datetime-local" [(ngModel)]="scheduledTime" class="form-input" />
              </div>
            </div>
          </div>

          <!-- Custom Application Properties -->
          <div class="form-section">
            <div class="section-title">
              <span>Application Properties (Custom Headers)</span>
              <button class="btn btn-secondary btn-sm" (click)="addProperty()">+ Add Property</button>
            </div>
            @for (prop of customProps; track $index) {
              <div class="prop-row">
                <input type="text" [(ngModel)]="prop.key" placeholder="Key" class="form-input" style="flex: 2;" />
                <select [(ngModel)]="prop.type" class="form-select" style="flex: 1;">
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="guid">Guid</option>
                </select>
                <input type="text" [(ngModel)]="prop.value" placeholder="Value" class="form-input" style="flex: 2;" />
                <button class="btn btn-danger btn-sm" (click)="removeProperty($index)">✕</button>
              </div>
            }
          </div>

          @if (errorMessage()) {
            <div class="error-banner">{{ errorMessage() }}</div>
          }
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="close()">Cancel</button>
          <button class="btn btn-primary" (click)="send()" [disabled]="isSending()">
            {{ isSending() ? 'Sending...' : (scheduledTime ? 'Schedule Message' : 'Send Message Now') }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .form-section {
      margin-bottom: 14px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .body-tools {
      display: flex;
      gap: 6px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    label {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 3px;
    }
    .prop-row {
      display: flex;
      gap: 6px;
      margin-bottom: 6px;
      align-items: center;
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
export class SendModalComponent implements OnInit {
  @Input() entity!: SelectedEntity;
  @Input() initialData?: SendMessageRequest;
  @Output() closed = new EventEmitter<void>();
  @Output() sent = new EventEmitter<void>();

  private api = inject(ApiService);
  private state = inject(StateService);

  body = '';
  format: MessagePayloadFormat = 'Json';
  messageId = '';
  subject = '';
  correlationId = '';
  contentType = 'application/json';
  sessionId = '';
  partitionKey = '';
  ttlSeconds?: number;
  scheduledTime = '';

  customProps: { key: string; type: string; value: string }[] = [];
  isSending = signal<boolean>(false);
  errorMessage = signal<string>('');

  ngOnInit(): void {
    if (this.initialData) {
      this.body = this.initialData.body;
      this.format = this.initialData.format || 'Json';
      this.messageId = this.initialData.messageId || '';
      this.subject = this.initialData.subject || '';
      this.correlationId = this.initialData.correlationId || '';
      this.contentType = this.initialData.contentType || 'application/json';
      this.sessionId = this.initialData.sessionId || '';
      this.partitionKey = this.initialData.partitionKey || '';

      if (this.initialData.applicationProperties) {
        this.customProps = Object.entries(this.initialData.applicationProperties).map(([k, v]) => ({
          key: k,
          type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string',
          value: String(v)
        }));
      }
    }
  }

  formatJson() {
    try {
      const parsed = JSON.parse(this.body);
      this.body = JSON.stringify(parsed, null, 2);
    } catch (e: any) {
      this.errorMessage.set(`Invalid JSON: ${e.message}`);
    }
  }

  addProperty() {
    this.customProps.push({ key: '', type: 'string', value: '' });
  }

  removeProperty(index: number) {
    this.customProps.splice(index, 1);
  }

  close() {
    this.closed.emit();
  }

  send() {
    const conn = this.state.selectedConnection();
    if (!conn) return;

    this.isSending.set(true);
    this.errorMessage.set('');

    const appProps: Record<string, any> = {};
    for (const p of this.customProps) {
      if (p.key.trim()) {
        if (p.type === 'number') {
          appProps[p.key] = Number(p.value);
        } else if (p.type === 'boolean') {
          appProps[p.key] = p.value.toLowerCase() === 'true';
        } else {
          appProps[p.key] = p.value;
        }
      }
    }

    let timeToLiveStr: string | undefined = undefined;
    if (this.ttlSeconds && this.ttlSeconds > 0) {
      const h = Math.floor(this.ttlSeconds / 3600).toString().padStart(2, '0');
      const m = Math.floor((this.ttlSeconds % 3600) / 60).toString().padStart(2, '0');
      const s = (this.ttlSeconds % 60).toString().padStart(2, '0');
      timeToLiveStr = `${h}:${m}:${s}`;
    }

    const request: SendMessageRequest = {
      body: this.body,
      format: this.format,
      messageId: this.messageId.trim() || undefined,
      subject: this.subject.trim() || undefined,
      correlationId: this.correlationId.trim() || undefined,
      contentType: this.contentType.trim() || undefined,
      sessionId: this.sessionId.trim() || undefined,
      partitionKey: this.partitionKey.trim() || undefined,
      timeToLive: timeToLiveStr,
      scheduledEnqueueTime: this.scheduledTime ? new Date(this.scheduledTime).toISOString() : undefined,
      applicationProperties: Object.keys(appProps).length > 0 ? appProps : undefined
    };

    this.api.sendMessage(conn.id, this.entity, request).subscribe({
      next: (res) => {
        this.isSending.set(false);
        if (res.success) {
          this.sent.emit();
          this.close();
        } else {
          this.errorMessage.set(res.errorMessage || 'Send failed.');
        }
      },
      error: (err) => {
        this.isSending.set(false);
        this.errorMessage.set(err.message || 'Failed to send message.');
      }
    });
  }
}
