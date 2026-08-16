import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateService } from '../../core/services/state.service';
import { ConnectionProfile, SelectedEntity } from '../../core/models/service-bus.models';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="sidebar">
      <!-- Connection Selector Section -->
      <div class="sidebar-header">
        <div class="connection-label-row">
          <span class="section-heading">CONNECTIONS</span>
          <div class="header-btns">
            <button class="icon-btn" title="Rescan WSL Emulators" (click)="state.scanAndLoadConnections()">
              🔄
            </button>
            <button class="icon-btn" title="Add Connection" (click)="openConnectModal.emit()">
              ➕
            </button>
          </div>
        </div>

        <div class="connection-dropdown-container">
          <select
            class="form-select connection-select"
            [value]="state.selectedConnection()?.id"
            (change)="onConnectionChange($event)">
            @for (conn of state.connections(); track conn.id) {
              <option [value]="conn.id">
                {{ conn.isDiscovered ? '🟢 ' : '☁️ ' }} {{ conn.name }}
              </option>
            }
          </select>
        </div>
      </div>

      <!-- Entity Tree -->
      <div class="tree-container">
        <!-- Queues -->
        <div class="tree-group">
          <div class="group-header">
            <span class="group-title">Queues</span>
            <span class="badge badge-blue">{{ state.queues().length }}</span>
          </div>

          <div class="group-items">
            @for (q of state.queues(); track q.name) {
              <div
                class="tree-item"
                [class.selected]="isSelected('queue', q.name)"
                (click)="selectQueue(q)">
                <span class="item-icon">📬</span>
                <span class="item-name" [title]="q.name">{{ q.name }}</span>

                <div class="item-badges">
                  <span class="badge badge-blue" [title]="'Active messages: ' + q.counts.activeMessageCount">
                    {{ q.counts.activeMessageCount }}
                  </span>
                  @if (q.counts.deadLetterMessageCount > 0) {
                    <span class="badge badge-red" [title]="'Dead-letter messages: ' + q.counts.deadLetterMessageCount">
                      {{ q.counts.deadLetterMessageCount }}
                    </span>
                  }
                </div>
              </div>
            }
            @if (state.queues().length === 0) {
              <div class="empty-text">No queues found</div>
            }
          </div>
        </div>

        <!-- Topics -->
        <div class="tree-group">
          <div class="group-header">
            <span class="group-title">Topics</span>
            <span class="badge badge-blue">{{ state.topics().length }}</span>
          </div>

          <div class="group-items">
            @for (t of state.topics(); track t.name) {
              <div class="tree-topic">
                <div class="tree-item topic-header">
                  <span class="item-icon">📢</span>
                  <span class="item-name" [title]="t.name">{{ t.name }}</span>
                </div>

                <!-- Subscriptions -->
                <div class="subscription-list">
                  @for (sub of t.subscriptions; track sub.subscriptionName) {
                    <div
                      class="tree-item sub-item"
                      [class.selected]="isSelected('subscription', sub.subscriptionName, t.name)"
                      (click)="selectSubscription(t.name, sub)">
                      <span class="item-icon">↳ 📥</span>
                      <span class="item-name" [title]="sub.subscriptionName">{{ sub.subscriptionName }}</span>

                      <div class="item-badges">
                        <span class="badge badge-blue" [title]="'Active: ' + sub.counts.activeMessageCount">
                          {{ sub.counts.activeMessageCount }}
                        </span>
                        @if (sub.counts.deadLetterMessageCount > 0) {
                          <span class="badge badge-red" [title]="'DLQ: ' + sub.counts.deadLetterMessageCount">
                            {{ sub.counts.deadLetterMessageCount }}
                          </span>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
            @if (state.topics().length === 0) {
              <div class="empty-text">No topics found</div>
            }
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }
    .sidebar {
      width: 100%;
      background: var(--bg-sidebar);
      display: flex;
      flex-direction: column;
      height: 100%;
      user-select: none;
    }
    .sidebar-header {
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-header);
    }
    .connection-label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .section-heading {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: var(--text-dim);
    }
    .header-btns {
      display: flex;
      gap: 4px;
    }
    .icon-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 3px;
    }
    .icon-btn:hover {
      background: var(--bg-card);
      color: var(--text-main);
    }
    .connection-select {
      font-weight: 500;
      font-size: 12px;
    }
    .tree-container {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .tree-group {
      margin-bottom: 16px;
    }
    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 8px;
      margin-bottom: 4px;
    }
    .group-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
    }
    .tree-item {
      display: flex;
      align-items: center;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      gap: 6px;
      transition: background 0.1s ease;
    }
    .tree-item:hover {
      background: var(--bg-card-hover);
    }
    .tree-item.selected {
      background: var(--table-row-selected);
      border-left: 2px solid var(--accent-primary);
    }
    .item-icon {
      font-size: 12px;
    }
    .item-name {
      flex: 1;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-main);
    }
    .item-badges {
      display: flex;
      gap: 4px;
    }
    .subscription-list {
      padding-left: 12px;
    }
    .sub-item {
      padding: 4px 8px;
      font-size: 11px;
    }
    .empty-text {
      font-size: 11px;
      color: var(--text-dim);
      padding: 6px 8px;
      font-style: italic;
    }
  `]
})
export class SidebarComponent {
  @Output() openConnectModal = new EventEmitter<void>();

  state = inject(StateService);

  onConnectionChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const conn = this.state.connections().find(c => c.id === target.value);
    if (conn) {
      this.state.selectConnection(conn);
    }
  }

  selectQueue(queue: any) {
    this.state.selectEntity({
      type: 'queue',
      name: queue.name,
      counts: queue.counts
    });
  }

  selectSubscription(topicName: string, sub: any) {
    this.state.selectEntity({
      type: 'subscription',
      name: `${topicName}/${sub.subscriptionName}`,
      topicName: topicName,
      subscriptionName: sub.subscriptionName,
      counts: sub.counts
    });
  }

  isSelected(type: 'queue' | 'subscription', name: string, topicName?: string): boolean {
    const current = this.state.selectedEntity();
    if (!current) return false;
    if (type === 'queue') {
      return current.type === 'queue' && current.name === name;
    } else {
      return current.type === 'subscription' && current.subscriptionName === name && current.topicName === topicName;
    }
  }
}
