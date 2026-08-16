import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateService } from '../../core/services/state.service';
import { ApiService } from '../../core/services/api.service';
import { QueueSummary, TopicSummary } from '../../core/models/service-bus.models';
import { TreeNode, buildHierarchicalTree } from './sidebar-tree.models';

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
        <!-- Queues Group -->
        <div class="tree-group">
          <div class="group-header">
            <div class="group-title-left">
              <span class="group-title">Queues</span>
              <span class="badge badge-blue">{{ state.queues().length }}</span>
            </div>
            <button class="icon-btn add-btn" title="Create New Queue" (click)="openCreateModal.emit({ type: 'queue' })">
              ➕
            </button>
          </div>

          <div class="group-items">
            @for (node of queueTree(); track node.fullPath) {
              <ng-container *ngTemplateOutlet="queueNodeTpl; context: { $implicit: node, depth: 0 }"></ng-container>
            }
            @if (state.queues().length === 0) {
              <div class="empty-text">No queues found</div>
            }
          </div>
        </div>

        <!-- Topics Group -->
        <div class="tree-group">
          <div class="group-header">
            <div class="group-title-left">
              <span class="group-title">Topics</span>
              <span class="badge badge-blue">{{ state.topics().length }}</span>
            </div>
            <button class="icon-btn add-btn" title="Create New Topic" (click)="openCreateModal.emit({ type: 'topic' })">
              ➕
            </button>
          </div>

          <div class="group-items">
            @for (node of topicTree(); track node.fullPath) {
              <ng-container *ngTemplateOutlet="topicNodeTpl; context: { $implicit: node, depth: 0 }"></ng-container>
            }
            @if (state.topics().length === 0) {
              <div class="empty-text">No topics found</div>
            }
          </div>
        </div>
      </div>
    </aside>

    <!-- Recursive Queue Node Template -->
    <ng-template #queueNodeTpl let-node let-depth="depth">
      @if (node.isFolder) {
        <div class="folder-group" [style.padding-left.px]="depth * 10">
          <div class="tree-item folder-item" (click)="toggleFolder(node.fullPath, $event)">
            <span class="toggle-icon">{{ isExpanded(node.fullPath) ? '▼' : '▶' }}</span>
            <span class="item-icon">{{ isExpanded(node.fullPath) ? '📂' : '📁' }}</span>
            <span class="item-name folder-name" [title]="node.fullPath">{{ node.name }}</span>

            @if ((node.totalActiveCount || 0) > 0 || (node.totalDlqCount || 0) > 0) {
              <div class="item-badges">
                @if ((node.totalActiveCount || 0) > 0) {
                  <span class="badge badge-blue" title="Active messages in folder">{{ node.totalActiveCount }}</span>
                }
                @if ((node.totalDlqCount || 0) > 0) {
                  <span class="badge badge-red" title="DLQ messages in folder">{{ node.totalDlqCount }}</span>
                }
              </div>
            }
          </div>

          @if (isExpanded(node.fullPath)) {
            <div class="folder-children">
              @for (child of node.children; track child.fullPath) {
                <ng-container *ngTemplateOutlet="queueNodeTpl; context: { $implicit: child, depth: depth + 1 }"></ng-container>
              }
            </div>
          }
        </div>
      } @else if (node.item) {
        <div
          class="tree-item"
          [style.padding-left.px]="depth * 10 + 8"
          [class.selected]="isSelected('queue', node.item.name)"
          (click)="selectQueue(node.item)">
          <span class="item-icon">📬</span>
          <span class="item-name" [title]="node.item.name">{{ node.name }}</span>

          <div class="item-badges">
            <span class="badge badge-blue" [title]="'Active messages: ' + node.item.counts.activeMessageCount">
              {{ node.item.counts.activeMessageCount }}
            </span>
            @if (node.item.counts.deadLetterMessageCount > 0) {
              <span class="badge badge-red" [title]="'Dead-letter messages: ' + node.item.counts.deadLetterMessageCount">
                {{ node.item.counts.deadLetterMessageCount }}
              </span>
            }
            <button
              class="item-action-btn delete-btn"
              title="Delete Queue"
              (click)="deleteQueue(node.item.name, $event)">
              🗑️
            </button>
          </div>
        </div>
      }
    </ng-template>

    <!-- Recursive Topic Node Template -->
    <ng-template #topicNodeTpl let-node let-depth="depth">
      @if (node.isFolder) {
        <div class="folder-group" [style.padding-left.px]="depth * 10">
          <div class="tree-item folder-item" (click)="toggleFolder(node.fullPath, $event)">
            <span class="toggle-icon">{{ isExpanded(node.fullPath) ? '▼' : '▶' }}</span>
            <span class="item-icon">{{ isExpanded(node.fullPath) ? '📂' : '📁' }}</span>
            <span class="item-name folder-name" [title]="node.fullPath">{{ node.name }}</span>
          </div>

          @if (isExpanded(node.fullPath)) {
            <div class="folder-children">
              @for (child of node.children; track child.fullPath) {
                <ng-container *ngTemplateOutlet="topicNodeTpl; context: { $implicit: child, depth: depth + 1 }"></ng-container>
              }
            </div>
          }
        </div>
      } @else if (node.item) {
        <div class="tree-topic" [style.padding-left.px]="depth * 10">
          <div class="tree-item topic-header">
            <span class="item-icon">📢</span>
            <span class="item-name" [title]="node.item.name">{{ node.name }}</span>

            <div class="item-badges">
              <button
                class="item-action-btn"
                title="Add Subscription"
                (click)="openCreateModal.emit({ type: 'subscription', parentTopicName: node.item.name }); $event.stopPropagation()">
                ➕
              </button>
              <button
                class="item-action-btn delete-btn"
                title="Delete Topic"
                (click)="deleteTopic(node.item.name, $event)">
                🗑️
              </button>
            </div>
          </div>

          <!-- Subscriptions List -->
          <div class="subscription-list">
            @for (sub of node.item.subscriptions; track sub.subscriptionName) {
              <div
                class="tree-item sub-item"
                [class.selected]="isSelected('subscription', sub.subscriptionName, node.item.name)"
                (click)="selectSubscription(node.item.name, sub)">
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
                  <button
                    class="item-action-btn delete-btn"
                    title="Delete Subscription"
                    (click)="deleteSubscription(node.item.name, sub.subscriptionName, $event)">
                    🗑️
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      }
    </ng-template>
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
      transition: all 0.15s ease;
    }
    .icon-btn:hover {
      background: var(--bg-card);
      color: var(--text-main);
    }
    .add-btn {
      font-size: 11px;
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
    .group-title-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .group-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
    }
    .folder-group {
      display: flex;
      flex-direction: column;
    }
    .folder-item {
      font-weight: 600;
      color: var(--text-main);
    }
    .folder-name {
      color: var(--accent-primary) !important;
      font-weight: 600;
    }
    .toggle-icon {
      font-size: 9px;
      width: 12px;
      text-align: center;
      color: var(--text-dim);
    }
    .tree-item {
      display: flex;
      align-items: center;
      padding: 5px 8px;
      border-radius: 4px;
      cursor: pointer;
      gap: 6px;
      transition: background 0.1s ease;
      position: relative;
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
      align-items: center;
      gap: 4px;
    }
    .item-action-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 10px;
      padding: 2px;
      opacity: 0.4;
      transition: opacity 0.15s ease, transform 0.1s ease;
    }
    .tree-item:hover .item-action-btn {
      opacity: 0.8;
    }
    .item-action-btn:hover {
      opacity: 1;
      transform: scale(1.15);
    }
    .subscription-list {
      padding-left: 14px;
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
  @Output() openCreateModal = new EventEmitter<{ type: 'queue' | 'topic' | 'subscription'; parentTopicName?: string }>();

  state = inject(StateService);
  private api = inject(ApiService);

  private collapsedPaths = signal<Set<string>>(new Set<string>());

  queueTree = computed(() => buildHierarchicalTree(this.state.queues()));
  topicTree = computed(() => buildHierarchicalTree(this.state.topics()));

  isExpanded(fullPath: string): boolean {
    return !this.collapsedPaths().has(fullPath);
  }

  toggleFolder(fullPath: string, event: MouseEvent) {
    event.stopPropagation();
    const set = new Set(this.collapsedPaths());
    if (set.has(fullPath)) {
      set.delete(fullPath);
    } else {
      set.add(fullPath);
    }
    this.collapsedPaths.set(set);
  }

  onConnectionChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const conn = this.state.connections().find(c => c.id === target.value);
    if (conn) {
      this.state.selectConnection(conn);
    }
  }

  selectQueue(queue: QueueSummary) {
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

  deleteQueue(queueName: string, event: MouseEvent) {
    event.stopPropagation();
    const conn = this.state.selectedConnection();
    if (!conn) return;

    if (confirm(`Are you sure you want to delete queue "${queueName}"? All messages will be permanently lost.`)) {
      this.api.deleteQueue(conn.id, queueName).subscribe({
        next: () => {
          if (this.state.selectedEntity()?.name === queueName) {
            this.state.selectedEntity.set(null);
          }
          this.state.loadEntities();
        },
        error: (err) => alert(`Failed to delete queue: ${err.message || err}`)
      });
    }
  }

  deleteTopic(topicName: string, event: MouseEvent) {
    event.stopPropagation();
    const conn = this.state.selectedConnection();
    if (!conn) return;

    if (confirm(`Are you sure you want to delete topic "${topicName}" and all its subscriptions?`)) {
      this.api.deleteTopic(conn.id, topicName).subscribe({
        next: () => {
          const current = this.state.selectedEntity();
          if (current?.topicName === topicName || current?.name === topicName) {
            this.state.selectedEntity.set(null);
          }
          this.state.loadEntities();
        },
        error: (err) => alert(`Failed to delete topic: ${err.message || err}`)
      });
    }
  }

  deleteSubscription(topicName: string, subscriptionName: string, event: MouseEvent) {
    event.stopPropagation();
    const conn = this.state.selectedConnection();
    if (!conn) return;

    if (confirm(`Are you sure you want to delete subscription "${subscriptionName}" under topic "${topicName}"?`)) {
      this.api.deleteSubscription(conn.id, topicName, subscriptionName).subscribe({
        next: () => {
          const current = this.state.selectedEntity();
          if (current?.subscriptionName === subscriptionName && current?.topicName === topicName) {
            this.state.selectedEntity.set(null);
          }
          this.state.loadEntities();
        },
        error: (err) => alert(`Failed to delete subscription: ${err.message || err}`)
      });
    }
  }
}
