import { Component, Input, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateService } from '../../core/services/state.service';
import { ServiceBusMessageDto } from '../../core/models/service-bus.models';
import { PayloadViewerComponent } from '../../shared/components/payload-viewer.component';
import { PropertyGridComponent } from '../../shared/components/property-grid.component';

@Component({
  selector: 'app-message-detail',
  standalone: true,
  imports: [CommonModule, PayloadViewerComponent, PropertyGridComponent],
  template: `
    <aside class="detail-pane">
      @if (state.selectedMessage(); as msg) {
        <div class="detail-header">
          <div class="detail-title-row">
            <span class="detail-label">MESSAGE DETAILS</span>
            <button class="close-btn" (click)="state.selectedMessage.set(null)">✕</button>
          </div>
          <div class="msg-id-row">
            <span class="msg-id-text" [title]="msg.messageId">{{ msg.messageId }}</span>
            <button class="btn btn-secondary btn-sm" (click)="copyId(msg.messageId)">Copy ID</button>
          </div>

          <!-- Tab Bar -->
          <div class="detail-tabs">
            <button
              class="detail-tab"
              [class.active]="activeDetailTab() === 'payload'"
              (click)="activeDetailTab.set('payload')">
              Payload
            </button>
            <button
              class="detail-tab"
              [class.active]="activeDetailTab() === 'broker'"
              (click)="activeDetailTab.set('broker')">
              Broker Properties
            </button>
            <button
              class="detail-tab"
              [class.active]="activeDetailTab() === 'app'"
              (click)="activeDetailTab.set('app')">
              App Properties
              <span class="badge badge-purple">{{ appPropList().length }}</span>
            </button>
            @if (msg.deadLetterReason) {
              <button
                class="detail-tab dlq-tab"
                [class.active]="activeDetailTab() === 'dlq'"
                (click)="activeDetailTab.set('dlq')">
                DLQ Error
              </button>
            }
          </div>
        </div>

        <div class="detail-body">
          @if (activeDetailTab() === 'payload') {
            <app-payload-viewer
              [textBody]="msg.textBody || ''"
              [rawBytesBase64]="msg.rawBody"
              [detectedFormat]="msg.detectedFormat"></app-payload-viewer>
          } @else if (activeDetailTab() === 'broker') {
            <app-property-grid [items]="brokerPropList()"></app-property-grid>
          } @else if (activeDetailTab() === 'app') {
            <app-property-grid [items]="appPropList()"></app-property-grid>
          } @else if (activeDetailTab() === 'dlq') {
            <div class="dlq-detail-card">
              <div class="dlq-field">
                <span class="dlq-label">Reason:</span>
                <span class="dlq-val text-red">{{ msg.deadLetterReason }}</span>
              </div>
              <div class="dlq-field">
                <span class="dlq-label">Description:</span>
                <span class="dlq-val">{{ msg.deadLetterErrorDescription || 'None provided' }}</span>
              </div>
              <div class="dlq-field">
                <span class="dlq-label">Source:</span>
                <span class="dlq-val">{{ msg.deadLetterSource || 'N/A' }}</span>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="empty-detail-state">
          <div class="empty-icon">📄</div>
          <h4>No Message Selected</h4>
          <p>Click on any message row in the list to inspect its payload, headers, and metadata.</p>
        </div>
      }
    </aside>
  `,
  styles: [`
    .detail-pane {
      width: 440px;
      background: var(--bg-sidebar);
      border-left: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .detail-header {
      padding: 12px;
      background: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
    }
    .detail-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .detail-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: var(--text-dim);
    }
    .close-btn {
      background: transparent;
      border: none;
      color: var(--text-dim);
      cursor: pointer;
      font-size: 12px;
    }
    .msg-id-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 12px;
    }
    .msg-id-text {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--accent-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: text;
    }
    .detail-tabs {
      display: flex;
      gap: 4px;
    }
    .detail-tab {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      padding: 6px 8px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .detail-tab:hover {
      color: var(--text-main);
    }
    .detail-tab.active {
      color: var(--accent-primary);
      border-bottom-color: var(--accent-primary);
    }
    .dlq-tab.active {
      color: var(--accent-danger);
      border-bottom-color: var(--accent-danger);
    }
    .detail-body {
      flex: 1;
      padding: 10px;
      overflow: hidden;
    }
    .empty-detail-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 24px;
      text-align: center;
      color: var(--text-dim);
    }
    .empty-icon {
      font-size: 28px;
      margin-bottom: 8px;
    }
    .dlq-detail-card {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid var(--accent-danger);
      border-radius: 6px;
      padding: 12px;
    }
    .dlq-field {
      margin-bottom: 8px;
      font-size: 12px;
    }
    .dlq-label {
      font-weight: 600;
      color: var(--accent-danger);
      display: block;
      margin-bottom: 2px;
    }
    .dlq-val {
      color: var(--text-main);
      word-break: break-word;
      user-select: text;
    }
    .text-red {
      color: var(--accent-danger);
      font-weight: 600;
    }
  `]
})
export class MessageDetailComponent {
  state = inject(StateService);
  activeDetailTab = signal<'payload' | 'broker' | 'app' | 'dlq'>('payload');

  brokerPropList = computed(() => {
    const msg = this.state.selectedMessage();
    if (!msg) return [];

    return [
      { key: 'MessageId', value: msg.messageId, type: 'string' },
      { key: 'SequenceNumber', value: msg.sequenceNumber ?? '-', type: 'long' },
      { key: 'Subject', value: msg.subject ?? '-', type: 'string' },
      { key: 'ContentType', value: msg.contentType ?? '-', type: 'string' },
      { key: 'CorrelationId', value: msg.correlationId ?? '-', type: 'string' },
      { key: 'SessionId', value: msg.sessionId ?? '-', type: 'string' },
      { key: 'PartitionKey', value: msg.partitionKey ?? '-', type: 'string' },
      { key: 'DeliveryCount', value: msg.deliveryCount, type: 'int' },
      { key: 'TimeToLive', value: msg.timeToLive ?? '-', type: 'TimeSpan' },
      { key: 'EnqueuedTimeUtc', value: msg.enqueuedTime ?? '-', type: 'DateTimeOffset' },
      { key: 'ScheduledEnqueueTimeUtc', value: msg.scheduledEnqueueTime ?? '-', type: 'DateTimeOffset' },
      { key: 'LockToken', value: msg.lockToken ?? '-', type: 'Guid/string' },
      { key: 'LockedUntilUtc', value: msg.lockedUntil ?? '-', type: 'DateTimeOffset' },
      { key: 'To', value: msg.to ?? '-', type: 'string' },
      { key: 'ReplyTo', value: msg.replyTo ?? '-', type: 'string' },
      { key: 'ReplyToSessionId', value: msg.replyToSessionId ?? '-', type: 'string' }
    ];
  });

  appPropList = computed(() => {
    const msg = this.state.selectedMessage();
    if (!msg || !msg.applicationProperties) return [];

    return Object.entries(msg.applicationProperties).map(([k, v]) => ({
      key: k,
      value: String(v),
      type: typeof v
    }));
  });

  copyId(id: string) {
    navigator.clipboard.writeText(id);
  }
}
