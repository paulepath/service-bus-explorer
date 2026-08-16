import { Component, EventEmitter, Output, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../core/services/state.service';
import { ApiService } from '../../core/services/api.service';
import { ServiceBusMessageDto } from '../../core/models/service-bus.models';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="message-list-pane">
      @if (state.selectedEntity(); as entity) {
        <!-- Top Entity Bar -->
        <header class="entity-header">
          <div class="entity-title-row">
            <div class="entity-identity">
              <span class="badge" [class.badge-purple]="entity.type === 'subscription'" [class.badge-blue]="entity.type === 'queue'">
                {{ entity.type.toUpperCase() }}
              </span>
              <h2>{{ entity.name }}</h2>
            </div>

            <div class="header-action-group">
              <button class="btn btn-primary btn-sm" (click)="openSendModal.emit()">
                ➕ Send Message
              </button>
              <button class="btn btn-secondary btn-sm" (click)="state.loadMessages()">
                🔄 Peek / Refresh
              </button>

              <!-- Purge / Clear All Actions depending on Tab -->
              @if (state.activeTab() === 'deadletter') {
                <button
                  class="btn btn-danger btn-sm"
                  title="Permanently remove all messages from the Dead Letter Queue"
                  [disabled]="isProcessing() || (entity.counts?.deadLetterMessageCount ?? 0) === 0"
                  (click)="onPurgeAll(1)">
                  🗑️ Clear All Dead Letters ({{ entity.counts?.deadLetterMessageCount ?? 0 }})
                </button>
              } @else if (state.activeTab() === 'active') {
                <button
                  class="btn btn-danger-outline btn-sm"
                  title="Permanently remove all active messages from the queue/subscription"
                  [disabled]="isProcessing() || (entity.counts?.activeMessageCount ?? 0) === 0"
                  (click)="onPurgeAll(0)">
                  🗑️ Clear All Active ({{ entity.counts?.activeMessageCount ?? 0 }})
                </button>
              } @else if (state.activeTab() === 'scheduled') {
                <button
                  class="btn btn-danger-outline btn-sm"
                  title="Cancel all scheduled messages"
                  [disabled]="isProcessing() || (entity.counts?.scheduledMessageCount ?? 0) === 0"
                  (click)="onCancelAllScheduled()">
                  🗑️ Cancel All Scheduled ({{ entity.counts?.scheduledMessageCount ?? 0 }})
                </button>
              }

              <div class="auto-refresh-selector">
                <span class="refresh-label">Auto-refresh:</span>
                <select
                  class="form-select form-select-sm"
                  [value]="state.autoRefreshInterval()"
                  (change)="onAutoRefreshChange($event)">
                  <option value="0">Off</option>
                  <option value="2000">2s</option>
                  <option value="5000">5s</option>
                  <option value="10000">10s</option>
                  <option value="30000">30s</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Navigation Tabs -->
          <div class="tab-strip">
            <button
              class="tab-link"
              [class.active]="state.activeTab() === 'active'"
              (click)="onTabClick('active')">
              Active Messages
              <span class="badge badge-blue">{{ entity.counts?.activeMessageCount ?? 0 }}</span>
            </button>
            <button
              class="tab-link"
              [class.active]="state.activeTab() === 'deadletter'"
              (click)="onTabClick('deadletter')">
              Dead Letters
              <span class="badge badge-red">{{ entity.counts?.deadLetterMessageCount ?? 0 }}</span>
            </button>
            <button
              class="tab-link"
              [class.active]="state.activeTab() === 'scheduled'"
              (click)="onTabClick('scheduled')">
              Scheduled
              <span class="badge badge-amber">{{ entity.counts?.scheduledMessageCount ?? 0 }}</span>
            </button>
          </div>
        </header>

        <!-- Search & Selection Bar -->
        <div class="filter-bar">
          <div class="search-input-wrapper">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              class="form-input search-input"
              placeholder="Search in loaded messages (ID, Subject, Body, Headers, DLQ Reason)..."
              [ngModel]="state.searchQuery()"
              (ngModelChange)="state.searchQuery.set($event)" />
            @if (state.searchQuery()) {
              <button class="clear-search-btn" (click)="state.searchQuery.set('')">✕</button>
            }
          </div>

          <!-- Selection Action Bar -->
          @if (selectedCount() > 0) {
            <div class="selection-actions">
              <span class="selection-pill">
                ☑️ {{ selectedCount() }} selected
              </span>
              <button
                class="btn btn-danger btn-sm"
                [disabled]="isProcessing()"
                (click)="onDeleteSelected()">
                🗑️ Delete Selected ({{ selectedCount() }})
              </button>
              <button class="btn btn-secondary btn-sm" (click)="clearSelection()">
                ✕ Deselect
              </button>
            </div>
          } @else {
            <div class="message-counter">
              Showing {{ state.filteredMessages().length }} of {{ state.messages().length }} peeked
            </div>
          }
        </div>

        <!-- Processing Banner -->
        @if (isProcessing()) {
          <div class="processing-banner">
            <span class="spinner-icon">⏳</span>
            <span>{{ processingMessage() }}</span>
          </div>
        }

        <!-- Message Table -->
        <div class="table-container">
          <table class="message-table">
            <thead>
              <tr>
                <th style="width: 36px; text-align: center;">
                  <input
                    type="checkbox"
                    class="row-checkbox"
                    [checked]="isAllSelected()"
                    (change)="toggleSelectAll($event)"
                    title="Select / Deselect all visible messages" />
                </th>
                <th style="width: 70px;">Seq #</th>
                <th style="width: 220px;">Message ID</th>
                <th>Subject</th>
                <th style="width: 120px;">Format</th>
                <th style="width: 160px;">Enqueued (UTC)</th>
                @if (state.activeTab() === 'deadletter') {
                  <th style="width: 140px;">DLQ Reason</th>
                }
                <th style="width: 50px;">Delivery</th>
                <th style="width: 140px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (msg of state.filteredMessages(); track msg.sequenceNumber || msg.messageId) {
                <tr
                  [class.selected]="state.selectedMessage()?.sequenceNumber === msg.sequenceNumber"
                  [class.row-checked]="isSelected(msg)"
                  (click)="state.selectedMessage.set(msg)">
                  <td class="col-checkbox" (click)="$event.stopPropagation()">
                    <input
                      type="checkbox"
                      class="row-checkbox"
                      [checked]="isSelected(msg)"
                      (change)="toggleSelect(msg, $event)" />
                  </td>
                  <td class="col-mono">{{ msg.sequenceNumber ?? '-' }}</td>
                  <td class="col-mono col-truncate" [title]="msg.messageId">{{ msg.messageId }}</td>
                  <td class="col-truncate" [title]="msg.subject || ''">{{ msg.subject || '-' }}</td>
                  <td><span class="badge badge-blue">{{ msg.detectedFormat }}</span></td>
                  <td class="col-mono text-dim">{{ formatEnqueued(msg.enqueuedTime) }}</td>
                  @if (state.activeTab() === 'deadletter') {
                    <td class="col-truncate col-dlq" [title]="msg.deadLetterReason || ''">{{ msg.deadLetterReason || '-' }}</td>
                  }
                  <td class="col-mono">{{ msg.deliveryCount }}</td>
                  <td class="col-actions" (click)="$event.stopPropagation()">
                    <button class="btn btn-secondary btn-sm" title="Clone / Edit & Resend" (click)="onClone(msg, $event)">
                      Clone
                    </button>
                    @if (state.activeTab() === 'deadletter') {
                      <button class="btn btn-primary btn-sm" title="Resend DLQ Message" (click)="onResend(msg, $event)">
                        Resend
                      </button>
                    }
                    <button
                      class="btn btn-danger-icon btn-sm"
                      title="Delete this message"
                      [disabled]="isProcessing()"
                      (click)="onDeleteSingle(msg, $event)">
                      🗑️
                    </button>
                  </td>
                </tr>
              }
              @if (state.filteredMessages().length === 0) {
                <tr>
                  <td [attr.colspan]="state.activeTab() === 'deadletter' ? 9 : 8" class="empty-table">
                    @if (state.isLoading()) {
                      <span>Peeking messages safely...</span>
                    } @else {
                      <span>No messages in this subqueue (Peek operations are safe and non-destructive)</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="no-selection-state">
          <div class="empty-icon">👈</div>
          <h3>Select a Queue or Topic Subscription</h3>
          <p>Choose an entity from the sidebar tree to browse and manage messages.</p>
        </div>
      }
    </main>
  `,
  styles: [`
    .message-list-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-main);
      overflow: hidden;
    }
    .entity-header {
      padding: 12px 16px 0 16px;
      background: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
    }
    .entity-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .entity-identity {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h2 {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-main);
    }
    .header-action-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .auto-refresh-selector {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .refresh-label {
      font-size: 11px;
      color: var(--text-dim);
    }
    .tab-strip {
      display: flex;
      gap: 4px;
    }
    .tab-link {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tab-link:hover {
      color: var(--text-main);
    }
    .tab-link.active {
      color: var(--accent-primary);
      border-bottom-color: var(--accent-primary);
    }
    .filter-bar {
      padding: 8px 16px;
      background: var(--bg-toolbar);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .search-input-wrapper {
      position: relative;
      flex: 1;
      max-width: 450px;
    }
    .search-icon {
      position: absolute;
      left: 8px;
      top: 6px;
      font-size: 11px;
      color: var(--text-dim);
    }
    .search-input {
      padding-left: 26px;
      padding-right: 24px;
      font-size: 11px;
    }
    .clear-search-btn {
      position: absolute;
      right: 6px;
      top: 6px;
      background: transparent;
      border: none;
      color: var(--text-dim);
      cursor: pointer;
      font-size: 10px;
    }
    .selection-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .selection-pill {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent-primary);
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 3px 8px;
      border-radius: 12px;
    }
    .message-counter {
      font-size: 11px;
      color: var(--text-dim);
    }
    .processing-banner {
      background: rgba(245, 158, 11, 0.15);
      border-bottom: 1px solid var(--accent-warning);
      color: var(--accent-warning);
      padding: 6px 16px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .spinner-icon {
      animation: pulse 1s infinite;
    }
    .table-container {
      flex: 1;
      overflow: auto;
    }
    .message-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      background: var(--bg-toolbar);
      color: var(--text-muted);
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--table-border-row);
      color: var(--text-main);
    }
    tr {
      cursor: pointer;
      transition: background 0.1s ease;
    }
    tr:hover td {
      background: var(--table-row-hover);
    }
    tr.selected td {
      background: var(--table-row-selected);
    }
    tr.row-checked td {
      background: rgba(239, 68, 68, 0.06);
    }
    .col-checkbox {
      text-align: center;
      width: 36px;
    }
    .row-checkbox {
      cursor: pointer;
      accent-color: var(--accent-danger);
    }
    .col-mono {
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .col-truncate {
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .col-dlq {
      color: var(--accent-danger);
      font-weight: 500;
    }
    .col-actions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 4px;
    }
    .btn-danger {
      background: var(--accent-danger);
      color: #ffffff;
      border: 1px solid var(--accent-danger);
      font-weight: 600;
    }
    .btn-danger:hover:not(:disabled) {
      opacity: 0.9;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
    }
    .btn-danger-outline {
      background: transparent;
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.5);
      font-weight: 500;
    }
    .btn-danger-outline:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.15);
      border-color: var(--accent-danger);
      color: #ffffff;
    }
    .btn-danger-icon {
      background: transparent;
      border: none;
      color: var(--text-dim);
      padding: 3px 5px;
      cursor: pointer;
      font-size: 11px;
      border-radius: 3px;
      transition: all 0.15s ease;
    }
    .btn-danger-icon:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.2);
      color: var(--accent-danger);
    }
    .empty-table {
      text-align: center;
      color: var(--text-dim);
      padding: 40px;
      font-style: italic;
    }
    .no-selection-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-dim);
    }
    .empty-icon {
      font-size: 32px;
      margin-bottom: 12px;
    }
    .text-dim {
      color: var(--text-dim);
    }
    @keyframes pulse {
      0% { opacity: 0.3; }
      50% { opacity: 1; }
      100% { opacity: 0.3; }
    }
  `]
})
export class MessageListComponent {
  @Output() openSendModal = new EventEmitter<void>();
  @Output() cloneMessage = new EventEmitter<ServiceBusMessageDto>();
  @Output() resendDlqMessage = new EventEmitter<ServiceBusMessageDto>();

  state = inject(StateService);
  private api = inject(ApiService);

  selectedSeqs = signal<Set<number>>(new Set<number>());
  isProcessing = signal<boolean>(false);
  processingMessage = signal<string>('');

  selectedCount = computed(() => this.selectedSeqs().size);

  isAllSelected = computed(() => {
    const list = this.state.filteredMessages();
    if (list.length === 0) return false;
    return list.every(m => m.sequenceNumber !== undefined && this.selectedSeqs().has(m.sequenceNumber));
  });

  private prevEntityKey = '';
  private prevTab = '';

  constructor() {
    // Reset selection only when entity or active tab changes, not on background count refresh
    effect(() => {
      const entity = this.state.selectedEntity();
      const tab = this.state.activeTab();
      const key = entity ? `${entity.type}:${entity.name}` : '';

      if (key !== this.prevEntityKey || tab !== this.prevTab) {
        this.prevEntityKey = key;
        this.prevTab = tab;
        this.selectedSeqs.set(new Set<number>());
      }
    });
  }


  onTabClick(tab: 'active' | 'deadletter' | 'scheduled' | 'details') {
    this.selectedSeqs.set(new Set<number>());
    this.state.setTab(tab);
  }

  isSelected(msg: ServiceBusMessageDto): boolean {
    return msg.sequenceNumber !== undefined && this.selectedSeqs().has(msg.sequenceNumber);
  }

  toggleSelect(msg: ServiceBusMessageDto, event: Event) {
    event.stopPropagation();
    if (msg.sequenceNumber === undefined) return;

    const set = new Set(this.selectedSeqs());
    if (set.has(msg.sequenceNumber)) {
      set.delete(msg.sequenceNumber);
    } else {
      set.add(msg.sequenceNumber);
    }
    this.selectedSeqs.set(set);
  }

  toggleSelectAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const set = new Set<number>();
    if (checked) {
      for (const msg of this.state.filteredMessages()) {
        if (msg.sequenceNumber !== undefined) {
          set.add(msg.sequenceNumber);
        }
      }
    }
    this.selectedSeqs.set(set);
  }

  clearSelection() {
    this.selectedSeqs.set(new Set<number>());
  }

  onAutoRefreshChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.state.setAutoRefreshInterval(Number(target.value));
  }

  onClone(msg: ServiceBusMessageDto, event: MouseEvent) {
    event.stopPropagation();
    this.cloneMessage.emit(msg);
  }

  onResend(msg: ServiceBusMessageDto, event: MouseEvent) {
    event.stopPropagation();
    this.resendDlqMessage.emit(msg);
  }

  onPurgeAll(subQueue: number) {
    const conn = this.state.selectedConnection();
    const entity = this.state.selectedEntity();
    if (!conn || !entity) return;

    const subQueueName = subQueue === 1 ? 'Dead Letter' : 'Active';
    const currentCount = subQueue === 1
      ? (entity.counts?.deadLetterMessageCount ?? 0)
      : (entity.counts?.activeMessageCount ?? 0);

    const message = `⚠️ WARNING: Are you sure you want to permanently delete ALL ${subQueueName} messages (${currentCount}) from "${entity.name}"?\n\nThis action cannot be undone.`;
    if (!confirm(message)) return;

    this.isProcessing.set(true);
    this.processingMessage.set(`Clearing all ${subQueueName} messages from ${entity.name}...`);

    this.api.purgeMessages(conn.id, entity, subQueue, 5000).subscribe({
      next: (res) => {
        this.isProcessing.set(false);
        this.clearSelection();
        this.state.statusMessage.set(`Successfully cleared ${res.purgedCount} ${subQueueName} message(s)`);
        this.state.loadMessages();
        this.state.refreshEntityCount();
      },
      error: (err) => {
        this.isProcessing.set(false);
        alert(`Failed to clear messages: ${err.message || err}`);
      }
    });
  }

  onCancelAllScheduled() {
    const conn = this.state.selectedConnection();
    const entity = this.state.selectedEntity();
    if (!conn || !entity) return;

    const scheduled = this.state.messages().filter(m => m.sequenceNumber !== undefined);
    if (scheduled.length === 0) return;

    if (!confirm(`Cancel all ${scheduled.length} visible scheduled messages for "${entity.name}"?`)) return;

    this.isProcessing.set(true);
    this.processingMessage.set(`Cancelling scheduled messages...`);

    let cancelled = 0;
    const promises = scheduled.map(m =>
      this.api.cancelScheduled(conn.id, entity, m.sequenceNumber!).toPromise().then(() => cancelled++)
    );

    Promise.allSettled(promises).then(() => {
      this.isProcessing.set(false);
      this.clearSelection();
      this.state.statusMessage.set(`Cancelled ${cancelled} scheduled message(s)`);
      this.state.loadMessages();
      this.state.refreshEntityCount();
    });
  }

  onDeleteSelected() {
    const conn = this.state.selectedConnection();
    const entity = this.state.selectedEntity();
    const seqs = Array.from(this.selectedSeqs());
    if (!conn || !entity || seqs.length === 0) return;

    const subQueue = this.state.activeTab() === 'deadletter' ? 1 : 0;
    const subQueueName = this.state.activeTab() === 'deadletter' ? 'dead-letter' : 'active';

    if (!confirm(`Permanently delete ${seqs.length} selected ${subQueueName} message(s) from "${entity.name}"?`)) return;

    this.isProcessing.set(true);
    this.processingMessage.set(`Deleting ${seqs.length} selected message(s)...`);

    if (this.state.activeTab() === 'scheduled') {
      const promises = seqs.map(seq => this.api.cancelScheduled(conn.id, entity, seq).toPromise());
      Promise.allSettled(promises).then(() => {
        this.isProcessing.set(false);
        this.clearSelection();
        this.state.statusMessage.set(`Cancelled ${seqs.length} scheduled message(s)`);
        this.state.loadMessages();
        this.state.refreshEntityCount();
      });
      return;
    }

    this.api.deleteMessages(conn.id, entity, seqs, subQueue).subscribe({
      next: (res) => {
        this.isProcessing.set(false);
        this.clearSelection();
        this.state.statusMessage.set(`Deleted ${res.deletedCount} of ${res.requestedCount} selected message(s)`);
        this.state.loadMessages();
        this.state.refreshEntityCount();
      },
      error: (err) => {
        this.isProcessing.set(false);
        alert(`Failed to delete selected messages: ${err.message || err}`);
      }
    });
  }

  onDeleteSingle(msg: ServiceBusMessageDto, event: MouseEvent) {
    event.stopPropagation();
    const conn = this.state.selectedConnection();
    const entity = this.state.selectedEntity();
    if (!conn || !entity || msg.sequenceNumber === undefined) return;

    const subQueue = this.state.activeTab() === 'deadletter' ? 1 : 0;
    if (!confirm(`Delete message with Sequence #${msg.sequenceNumber} (ID: ${msg.messageId})?`)) return;

    this.isProcessing.set(true);
    this.processingMessage.set(`Deleting message #${msg.sequenceNumber}...`);

    if (this.state.activeTab() === 'scheduled') {
      this.api.cancelScheduled(conn.id, entity, msg.sequenceNumber).subscribe({
        next: () => {
          this.isProcessing.set(false);
          this.selectedSeqs.update(s => { s.delete(msg.sequenceNumber!); return new Set(s); });
          this.state.loadMessages();
          this.state.refreshEntityCount();
        },
        error: (err) => {
          this.isProcessing.set(false);
          alert(`Failed to cancel scheduled message: ${err.message || err}`);
        }
      });
      return;
    }

    this.api.deleteMessages(conn.id, entity, [msg.sequenceNumber], subQueue).subscribe({
      next: () => {
        this.isProcessing.set(false);
        this.selectedSeqs.update(s => { s.delete(msg.sequenceNumber!); return new Set(s); });
        this.state.loadMessages();
        this.state.refreshEntityCount();
      },
      error: (err) => {
        this.isProcessing.set(false);
        alert(`Failed to delete message: ${err.message || err}`);
      }
    });
  }

  formatEnqueued(iso?: string): string {
    if (!iso) return '-';
    try {
      const date = new Date(iso);
      return date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
    } catch {
      return iso;
    }
  }
}
