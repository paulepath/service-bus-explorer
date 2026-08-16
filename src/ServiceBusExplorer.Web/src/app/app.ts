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
    ResendModalComponent
  ],
  template: `
    <div class="app-layout">
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

      <!-- Main 3-Pane Body -->
      <div class="app-body">
        <app-sidebar (openConnectModal)="showConnectModal.set(true)"></app-sidebar>
        <app-message-list
          (openSendModal)="openNewSendModal()"
          (cloneMessage)="openCloneModal($event)"
          (resendDlqMessage)="openResendModal($event)"></app-message-list>
        <app-message-detail></app-message-detail>
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
    .app-header {
      height: 42px;
      background: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      user-select: none;
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

  showConnectModal = signal<boolean>(false);
  showSendModal = signal<boolean>(false);
  showResendModal = signal<boolean>(false);

  sendModalInitialData?: SendMessageRequest;
  selectedDlqMessage?: ServiceBusMessageDto;

  ngOnInit(): void {
    this.state.init();
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
