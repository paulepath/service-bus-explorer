import { Injectable, signal, computed, inject } from '@angular/core';
import { ApiService } from './api.service';
import {
  ConnectionProfile,
  DiscoveredEmulator,
  QueueSummary,
  TopicSummary,
  ServiceBusMessageDto,
  SelectedEntity
} from '../models/service-bus.models';

@Injectable({
  providedIn: 'root'
})
export class StateService {
  private api = inject(ApiService);

  readonly connections = signal<ConnectionProfile[]>([]);
  readonly discoveredEmulators = signal<DiscoveredEmulator[]>([]);
  readonly selectedConnection = signal<ConnectionProfile | null>(null);

  readonly queues = signal<QueueSummary[]>([]);
  readonly topics = signal<TopicSummary[]>([]);
  readonly selectedEntity = signal<SelectedEntity | null>(null);

  readonly activeTab = signal<'active' | 'deadletter' | 'scheduled' | 'details'>('active');
  readonly messages = signal<ServiceBusMessageDto[]>([]);
  readonly selectedMessage = signal<ServiceBusMessageDto | null>(null);
  readonly searchQuery = signal<string>('');

  readonly isLoading = signal<boolean>(false);
  readonly statusMessage = signal<string>('Ready');
  readonly autoRefreshInterval = signal<number>(5000); // 5s default

  readonly filteredMessages = computed(() => {
    const list = this.messages();
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return list;

    return list.filter(m =>
      (m.messageId && m.messageId.toLowerCase().includes(query)) ||
      (m.subject && m.subject.toLowerCase().includes(query)) ||
      (m.correlationId && m.correlationId.toLowerCase().includes(query)) ||
      (m.deadLetterReason && m.deadLetterReason.toLowerCase().includes(query)) ||
      (m.textBody && m.textBody.toLowerCase().includes(query)) ||
      Object.entries(m.applicationProperties || {}).some(
        ([k, v]) => k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)
      )
    );
  });

  private refreshTimer: any = null;

  init() {
    this.scanAndLoadConnections();
    this.setupAutoRefresh();
  }

  scanAndLoadConnections() {
    this.isLoading.set(true);
    this.statusMessage.set('Scanning for WSL/Docker Service Bus Emulators...');

    this.api.discoverAndRegister().subscribe({
      next: (conns) => {
        this.connections.set(conns);
        this.isLoading.set(false);
        this.statusMessage.set(`Found ${conns.length} connection(s)`);

        if (conns.length > 0 && !this.selectedConnection()) {
          this.selectConnection(conns[0]);
        }
      },
      error: (err) => {
        console.error('Discovery error:', err);
        // Fallback to getting list
        this.api.getConnections().subscribe({
          next: (conns) => {
            this.connections.set(conns);
            this.isLoading.set(false);
            if (conns.length > 0 && !this.selectedConnection()) {
              this.selectConnection(conns[0]);
            }
          },
          error: () => this.isLoading.set(false)
        });
      }
    });

    this.api.getDiscoveredEmulators().subscribe({
      next: (emus) => this.discoveredEmulators.set(emus),
      error: (err) => console.error('Failed to get discovered emulators:', err)
    });
  }

  selectConnection(conn: ConnectionProfile) {
    this.selectedConnection.set(conn);
    this.selectedEntity.set(null);
    this.messages.set([]);
    this.selectedMessage.set(null);
    this.loadEntities(conn.id);
  }

  loadEntities(connectionId: string) {
    this.isLoading.set(true);
    this.statusMessage.set('Loading entities...');

    this.api.getQueues(connectionId).subscribe({
      next: (queues) => {
        this.queues.set(queues);
        this.isLoading.set(false);
        this.statusMessage.set(`Loaded ${queues.length} queues`);

        // Select first queue by default if none selected
        if (!this.selectedEntity() && queues.length > 0) {
          this.selectEntity({
            type: 'queue',
            name: queues[0].name,
            counts: queues[0].counts
          });
        }
      },
      error: (err) => {
        console.error('Failed to load queues:', err);
        this.isLoading.set(false);
      }
    });

    this.api.getTopics(connectionId).subscribe({
      next: (topics) => this.topics.set(topics),
      error: (err) => console.error('Failed to load topics:', err)
    });
  }

  selectEntity(entity: SelectedEntity) {
    this.selectedEntity.set(entity);
    this.selectedMessage.set(null);
    this.loadMessages();
  }

  setTab(tab: 'active' | 'deadletter' | 'scheduled' | 'details') {
    this.activeTab.set(tab);
    this.selectedMessage.set(null);
    if (tab !== 'details') {
      this.loadMessages();
    }
  }

  loadMessages() {
    const conn = this.selectedConnection();
    const entity = this.selectedEntity();
    if (!conn || !entity) return;

    const subQueue = this.activeTab() === 'deadletter' ? 1 : 0;
    this.isLoading.set(true);
    this.statusMessage.set(`Peeking messages from ${entity.name}...`);

    this.api.getMessages(conn.id, entity, subQueue, 50).subscribe({
      next: (msgs) => {
        this.messages.set(msgs);
        this.isLoading.set(false);
        this.statusMessage.set(`Peeked ${msgs.length} message(s) safely (no messages consumed)`);
        if (msgs.length > 0 && !this.selectedMessage()) {
          this.selectedMessage.set(msgs[0]);
        }
      },
      error: (err) => {
        console.error('Failed to peek messages:', err);
        this.isLoading.set(false);
        this.statusMessage.set(`Error peeking messages: ${err.message || 'Check connection'}`);
      }
    });

    // Also refresh count
    this.refreshEntityCount();
  }

  refreshEntityCount() {
    const conn = this.selectedConnection();
    const entity = this.selectedEntity();
    if (!conn || !entity) return;

    this.api.getEntityCounts(conn.id, entity).subscribe({
      next: (counts) => {
        const current = this.selectedEntity();
        if (current) {
          this.selectedEntity.set({ ...current, counts });
        }
        // Update item in queues/topics list
        if (entity.type === 'queue') {
          this.queues.update(list => list.map(q => q.name === entity.name ? { ...q, counts } : q));
        }
      },
      error: (err) => console.error('Count refresh failed:', err)
    });
  }

  setAutoRefreshInterval(ms: number) {
    this.autoRefreshInterval.set(ms);
    this.setupAutoRefresh();
  }

  private setupAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    const interval = this.autoRefreshInterval();
    if (interval > 0) {
      this.refreshTimer = setInterval(() => {
        if (this.selectedConnection() && this.selectedEntity()) {
          this.refreshEntityCount();
        }
      }, interval);
    }
  }
}
