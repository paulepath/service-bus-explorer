import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../core/services/state.service';
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
              (click)="state.setTab('active')">
              Active Messages
              <span class="badge badge-blue">{{ entity.counts?.activeMessageCount ?? 0 }}</span>
            </button>
            <button
              class="tab-link"
              [class.active]="state.activeTab() === 'deadletter'"
              (click)="state.setTab('deadletter')">
              Dead Letters
              <span class="badge badge-red">{{ entity.counts?.deadLetterMessageCount ?? 0 }}</span>
            </button>
            <button
              class="tab-link"
              [class.active]="state.activeTab() === 'scheduled'"
              (click)="state.setTab('scheduled')">
              Scheduled
              <span class="badge badge-amber">{{ entity.counts?.scheduledMessageCount ?? 0 }}</span>
            </button>
          </div>
        </header>

        <!-- Search / Filter Bar -->
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

          <div class="message-counter">
            Showing {{ state.filteredMessages().length }} of {{ state.messages().length }} peeked
          </div>
        </div>

        <!-- Message Table -->
        <div class="table-container">
          <table class="message-table">
            <thead>
              <tr>
                <th style="width: 70px;">Seq #</th>
                <th style="width: 220px;">Message ID</th>
                <th>Subject</th>
                <th style="width: 120px;">Format</th>
                <th style="width: 160px;">Enqueued (UTC)</th>
                @if (state.activeTab() === 'deadletter') {
                  <th style="width: 140px;">DLQ Reason</th>
                }
                <th style="width: 50px;">Delivery</th>
                <th style="width: 110px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (msg of state.filteredMessages(); track msg.sequenceNumber || msg.messageId) {
                <tr
                  [class.selected]="state.selectedMessage()?.sequenceNumber === msg.sequenceNumber"
                  (click)="state.selectedMessage.set(msg)">
                  <td class="col-mono">{{ msg.sequenceNumber ?? '-' }}</td>
                  <td class="col-mono col-truncate" [title]="msg.messageId">{{ msg.messageId }}</td>
                  <td class="col-truncate" [title]="msg.subject || ''">{{ msg.subject || '-' }}</td>
                  <td><span class="badge badge-blue">{{ msg.detectedFormat }}</span></td>
                  <td class="col-mono text-dim">{{ formatEnqueued(msg.enqueuedTime) }}</td>
                  @if (state.activeTab() === 'deadletter') {
                    <td class="col-truncate col-dlq" [title]="msg.deadLetterReason || ''">{{ msg.deadLetterReason || '-' }}</td>
                  }
                  <td class="col-mono">{{ msg.deliveryCount }}</td>
                  <td class="col-actions">
                    <button class="btn btn-secondary btn-sm" title="Clone / Edit & Resend" (click)="onClone(msg, $event)">
                      Clone
                    </button>
                    @if (state.activeTab() === 'deadletter') {
                      <button class="btn btn-primary btn-sm" title="Resend DLQ Message" (click)="onResend(msg, $event)">
                        Resend
                      </button>
                    }
                  </td>
                </tr>
              }
              @if (state.filteredMessages().length === 0) {
                <tr>
                  <td [attr.colspan]="state.activeTab() === 'deadletter' ? 8 : 7" class="empty-table">
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
      max-width: 500px;
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
    .message-counter {
      font-size: 11px;
      color: var(--text-dim);
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
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    td {
      padding: 8px 12px;
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
      gap: 4px;
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
  `]
})
export class MessageListComponent {
  @Output() openSendModal = new EventEmitter<void>();
  @Output() cloneMessage = new EventEmitter<ServiceBusMessageDto>();
  @Output() resendDlqMessage = new EventEmitter<ServiceBusMessageDto>();

  state = inject(StateService);

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
