import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateService } from './core/services/state.service';
import { ThemeService } from './core/services/theme.service';
import { SidebarComponent } from './features/sidebar/sidebar.component';
import { MessageListComponent } from './features/message-list/message-list.component';
import { MessageDetailComponent } from './features/message-detail/message-detail.component';
import { SendModalComponent } from './shared/components/send-modal.component';
import { ConnectModalComponent } from './shared/components/connect-modal.component';
import { ResendModalComponent } from './shared/components/resend-modal.component';
import { CreateEntityModalComponent, EntityCreationType } from './shared/components/create-entity-modal.component';
import { SendMessageRequest, ServiceBusMessageDto } from './core/models/service-bus.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    MessageListComponent,
    MessageDetailComponent,
    SendModalComponent,
    ConnectModalComponent,
    ResendModalComponent,
    CreateEntityModalComponent
  ],
  template: `
    <div class="app-layout" [class.resizing]="isResizing()">
      <!-- Top Title Bar -->
      <header class="app-header">
        <div class="brand">
          <span class="logo-icon">⚡</span>
          <h1 class="app-title">Service Bus Explorer</h1>
          <span class="version-tag">v1.0 (.NET 10 + Angular)</span>
        </div>

        <div class="header-status">
          @if (state.selectedConnection(); as conn) {
            <div class="status-pill" [class.local-pill]="conn.isDiscovered">
              <span class="pill-dot"></span>
              <span class="pill-text">{{ conn.name }}</span>
            </div>
          }
          @if (state.discoveredEmulators().length > 0) {
            <span class="badge badge-green" title="WSL2 Docker Service Bus Emulators detected">
              🟢 {{ state.discoveredEmulators().length }} WSL Emulator(s)
            </span>
          }
          <!-- Theme Switcher Button -->
          <button
            class="theme-toggle-btn"
            [title]="themeService.currentTheme() === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            (click)="themeService.toggleTheme()">
            {{ themeService.currentTheme() === 'dark' ? '☀️ Light' : '🌙 Dark' }}
          </button>
        </div>
      </header>

      <!-- Main 3-Pane Body with Draggable Splitters -->
      <div class="app-body">
        <!-- Sidebar (Left Pane) -->
        <div class="pane-sidebar" [style.width.px]="sidebarWidth()">
          <app-sidebar
            (openConnectModal)="showConnectModal.set(true)"
            (openCreateModal)="onOpenCreateModal($event)"></app-sidebar>
        </div>

        <!-- Left Splitter Handle -->
        <div
          class="splitter-gutter splitter-left"
          title="Drag to resize sidebar"
          (mousedown)="startResize('sidebar', $event)">
          <div class="splitter-line"></div>
        </div>

        <!-- Message List (Center Pane) -->
        <div class="pane-center">
          <app-message-list
            (openSendModal)="openNewSendModal()"
            (cloneMessage)="openCloneModal($event)"
            (resendDlqMessage)="openResendModal($event)"></app-message-list>
        </div>

        <!-- Right Splitter Handle -->
        <div
          class="splitter-gutter splitter-right"
          title="Drag to resize message detail inspector"
          (mousedown)="startResize('detail', $event)">
          <div class="splitter-line"></div>
        </div>

        <!-- Message Detail Inspector (Right Pane) -->
        <div class="pane-detail" [style.width.px]="detailWidth()">
          <app-message-detail></app-message-detail>
        </div>
      </div>

      <!-- Status Bar -->
      <footer class="app-statusbar">
        <div class="status-left">
          <span class="status-icon" [class.loading]="state.isLoading()">●</span>
          <span>{{ state.statusMessage() }}</span>
        </div>
        <div class="status-right">
          <span class="safety-indicator">🛡️ Safe Browse: Peek Only (No Message Loss)</span>
        </div>
      </footer>

      <!-- Modals -->
      @if (showConnectModal()) {
        <app-connect-modal
          (closed)="showConnectModal.set(false)"
          (connected)="showConnectModal.set(false)"></app-connect-modal>
      }

      @if (showCreateEntityModal()) {
        <app-create-entity-modal
          [entityType]="createEntityType"
          [parentTopicName]="createParentTopicName"
          (closed)="showCreateEntityModal.set(false)"
          (created)="state.loadEntities()"></app-create-entity-modal>
      }

      @if (showSendModal() && state.selectedEntity(); as entity) {
        <app-send-modal
          [entity]="entity"
          [initialData]="sendModalInitialData"
          (closed)="showSendModal.set(false)"
          (sent)="state.loadMessages()"></app-send-modal>
      }

      @if (showResendModal() && state.selectedEntity(); as entity) {
        @if (selectedDlqMessage) {
          <app-resend-modal
            [entity]="entity"
            [message]="selectedDlqMessage"
            (closed)="showResendModal.set(false)"
            (completed)="state.loadMessages()"></app-resend-modal>
        }
      }
    </div>
  `,
  styles: [`
    .app-layout {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      background: var(--bg-main);
      color: var(--text-main);
    }
    .app-layout.resizing {
      user-select: none;
      cursor: col-resize !important;
    }
    .app-header {
      height: 42px;
      background: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      user-select: none;
      z-index: 10;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo-icon {
      font-size: 16px;
      color: var(--accent-primary);
    }
    .app-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.2px;
      color: var(--text-main);
    }
    .version-tag {
      font-size: 10px;
      color: var(--text-dim);
      font-family: var(--font-mono);
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      padding: 2px 6px;
      border-radius: 4px;
    }
    .header-status {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .theme-toggle-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 4px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .theme-toggle-btn:hover {
      background: var(--bg-card-hover);
      border-color: var(--text-dim);
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      color: var(--accent-primary);
    }
    .status-pill.local-pill {
      background: rgba(16, 185, 129, 0.1);
      border-color: rgba(16, 185, 129, 0.3);
      color: var(--accent-success);
    }
    .pill-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .app-body {
      flex: 1;
      display: flex;
      overflow: hidden;
      position: relative;
    }
    .pane-sidebar {
      height: 100%;
      flex-shrink: 0;
      overflow: hidden;
    }
    .pane-center {
      flex: 1;
      height: 100%;
      min-width: 250px;
      overflow: hidden;
    }
    .pane-detail {
      height: 100%;
      flex-shrink: 0;
      overflow: hidden;
    }
    .splitter-gutter {
      width: 6px;
      height: 100%;
      cursor: col-resize;
      background: var(--border-color);
      position: relative;
      flex-shrink: 0;
      z-index: 5;
      transition: background 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .splitter-gutter:hover, .app-layout.resizing .splitter-gutter {
      background: var(--accent-primary);
    }
    .splitter-line {
      width: 2px;
      height: 24px;
      border-radius: 1px;
      background: var(--text-dim);
      opacity: 0.6;
    }
    .splitter-gutter:hover .splitter-line {
      background: #ffffff;
      opacity: 1;
    }
    .app-statusbar {
      height: 24px;
      background: var(--bg-statusbar);
      border-top: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      font-size: 11px;
      color: var(--text-dim);
      user-select: none;
      z-index: 10;
    }
    .status-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-icon {
      color: var(--accent-success);
      font-size: 10px;
    }
    .status-icon.loading {
      color: var(--accent-warning);
      animation: pulse 1s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.3; }
      50% { opacity: 1; }
      100% { opacity: 0.3; }
    }
    .safety-indicator {
      color: var(--accent-primary);
      font-size: 10px;
      font-weight: 500;
    }
  `]
})
export class App implements OnInit {
  state = inject(StateService);
  themeService = inject(ThemeService);

  sidebarWidth = signal<number>(280);
  detailWidth = signal<number>(440);
  isResizing = signal<boolean>(false);

  showConnectModal = signal<boolean>(false);
  showSendModal = signal<boolean>(false);
  showResendModal = signal<boolean>(false);
  showCreateEntityModal = signal<boolean>(false);

  createEntityType: EntityCreationType = 'queue';
  createParentTopicName?: string;

  sendModalInitialData?: SendMessageRequest;
  selectedDlqMessage?: ServiceBusMessageDto;

  private activeResizer: 'sidebar' | 'detail' | null = null;
  private startX = 0;
  private startWidth = 0;

  ngOnInit(): void {
    const savedSidebar = localStorage.getItem('sbe_sidebar_width');
    if (savedSidebar) {
      const parsed = parseInt(savedSidebar, 10);
      if (!isNaN(parsed) && parsed >= 180 && parsed <= 600) {
        this.sidebarWidth.set(parsed);
      }
    }

    const savedDetail = localStorage.getItem('sbe_detail_width');
    if (savedDetail) {
      const parsed = parseInt(savedDetail, 10);
      if (!isNaN(parsed) && parsed >= 280 && parsed <= 900) {
        this.detailWidth.set(parsed);
      }
    }

    this.state.init();
  }

  onOpenCreateModal(event: { type: EntityCreationType; parentTopicName?: string }) {
    this.createEntityType = event.type;
    this.createParentTopicName = event.parentTopicName;
    this.showCreateEntityModal.set(true);
  }

  startResize(pane: 'sidebar' | 'detail', event: MouseEvent): void {
    event.preventDefault();
    this.activeResizer = pane;
    this.startX = event.clientX;
    this.startWidth = pane === 'sidebar' ? this.sidebarWidth() : this.detailWidth();
    this.isResizing.set(true);

    const onMouseMove = (e: MouseEvent) => {
      if (!this.activeResizer) return;
      const delta = e.clientX - this.startX;

      if (this.activeResizer === 'sidebar') {
        const newWidth = Math.max(180, Math.min(600, this.startWidth + delta));
        this.sidebarWidth.set(newWidth);
      } else if (this.activeResizer === 'detail') {
        const newWidth = Math.max(280, Math.min(window.innerWidth - 450, this.startWidth - delta));
        this.detailWidth.set(newWidth);
      }
    };

    const onMouseUp = () => {
      if (this.activeResizer === 'sidebar') {
        localStorage.setItem('sbe_sidebar_width', this.sidebarWidth().toString());
      } else if (this.activeResizer === 'detail') {
        localStorage.setItem('sbe_detail_width', this.detailWidth().toString());
      }
      this.activeResizer = null;
      this.isResizing.set(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  openNewSendModal() {
    this.sendModalInitialData = undefined;
    this.showSendModal.set(true);
  }

  openCloneModal(msg: ServiceBusMessageDto) {
    this.sendModalInitialData = {
      body: msg.textBody || '',
      format: msg.detectedFormat,
      subject: msg.subject,
      contentType: msg.contentType,
      correlationId: msg.correlationId,
      sessionId: msg.sessionId,
      partitionKey: msg.partitionKey,
      applicationProperties: msg.applicationProperties
    };
    this.showSendModal.set(true);
  }

  openResendModal(msg: ServiceBusMessageDto) {
    this.selectedDlqMessage = msg;
    this.showResendModal.set(true);
  }
}
