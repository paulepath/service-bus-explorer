import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessagePayloadFormat } from '../../core/models/service-bus.models';

@Component({
  selector: 'app-payload-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="payload-container">
      <div class="payload-toolbar">
        <div class="format-badges">
          <button
            class="tab-btn"
            [class.active]="viewMode() === 'formatted'"
            (click)="viewMode.set('formatted')">
            Formatted
          </button>
          <button
            class="tab-btn"
            [class.active]="viewMode() === 'raw'"
            (click)="viewMode.set('raw')">
            Raw Text
          </button>
          <button
            class="tab-btn"
            [class.active]="viewMode() === 'hex'"
            (click)="viewMode.set('hex')">
            Hex / Binary
          </button>
          @if (isJwt()) {
            <button
              class="tab-btn"
              [class.active]="viewMode() === 'jwt'"
              (click)="viewMode.set('jwt')">
              JWT Decoded
            </button>
          }
        </div>

        <div class="toolbar-actions">
          <span class="badge badge-blue">{{ detectedFormat }}</span>
          <button class="btn btn-secondary btn-sm" (click)="copyPayload()">
            {{ copied() ? '✓ Copied' : 'Copy' }}
          </button>
        </div>
      </div>

      <div class="payload-content">
        @if (viewMode() === 'formatted') {
          <pre class="code-view json-view">{{ formattedContent() }}</pre>
        } @else if (viewMode() === 'raw') {
          <pre class="code-view">{{ textBody || '(Empty Body)' }}</pre>
        } @else if (viewMode() === 'hex') {
          <pre class="code-view hex-view">{{ hexDump() }}</pre>
        } @else if (viewMode() === 'jwt') {
          <pre class="code-view jwt-view">{{ jwtContent() }}</pre>
        }
      </div>
    </div>
  `,
  styles: [`
    .payload-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-code);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
    }
    .payload-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      background: var(--bg-toolbar);
      border-bottom: 1px solid var(--border-color);
    }
    .format-badges {
      display: flex;
      gap: 4px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 3px;
    }
    .tab-btn:hover {
      color: var(--text-main);
      background: var(--bg-card-hover);
    }
    .tab-btn.active {
      color: var(--accent-primary);
      background: var(--table-row-selected);
    }
    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .payload-content {
      flex: 1;
      padding: 10px;
      overflow: auto;
    }
    .code-view {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-main);
      white-space: pre-wrap;
      word-break: break-word;
      user-select: text;
    }
    .hex-view {
      color: var(--text-muted);
      line-height: 1.6;
    }
    .jwt-view {
      color: var(--accent-primary);
    }
  `]
})
export class PayloadViewerComponent implements OnChanges {
  @Input() textBody: string = '';
  @Input() rawBytesBase64: string = '';
  @Input() detectedFormat: MessagePayloadFormat = 'PlainText';

  viewMode = signal<'formatted' | 'raw' | 'hex' | 'jwt'>('formatted');
  copied = signal<boolean>(false);
  formattedContent = signal<string>('');
  hexDump = signal<string>('');
  jwtContent = signal<string>('');
  isJwt = signal<boolean>(false);

  ngOnChanges(changes: SimpleChanges): void {
    this.updateFormattedViews();
  }

  private updateFormattedViews() {
    if (!this.textBody) {
      this.formattedContent.set('');
      this.hexDump.set('');
      this.isJwt.set(false);
      return;
    }

    if (this.detectedFormat === 'Json') {
      try {
        const parsed = JSON.parse(this.textBody);
        this.formattedContent.set(JSON.stringify(parsed, null, 2));
      } catch {
        this.formattedContent.set(this.textBody);
      }
    } else {
      this.formattedContent.set(this.textBody);
    }

    if (this.detectedFormat === 'Jwt') {
      this.isJwt.set(true);
      try {
        const parts = this.textBody.split('.');
        const header = JSON.parse(atob(parts[0]));
        const payload = JSON.parse(atob(parts[1]));
        this.jwtContent.set(`// HEADER:\n${JSON.stringify(header, null, 2)}\n\n// PAYLOAD:\n${JSON.stringify(payload, null, 2)}`);
      } catch {
        this.jwtContent.set(this.textBody);
      }
    } else {
      this.isJwt.set(false);
    }

    this.hexDump.set(this.generateHexDump(this.textBody));
  }

  private generateHexDump(text: string): string {
    const lines: string[] = [];
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const len = Math.min(bytes.length, 512);

    for (let i = 0; i < len; i += 16) {
      const chunk = bytes.slice(i, i + 16);
      const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(chunk).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
      const offset = i.toString(16).padStart(4, '0');
      lines.push(`${offset}  ${hex.padEnd(48, ' ')}  |${ascii}|`);
    }

    if (bytes.length > 512) {
      lines.push(`... [${bytes.length - 512} more bytes truncated]`);
    }

    return lines.join('\n');
  }

  copyPayload() {
    const textToCopy = this.viewMode() === 'formatted' ? this.formattedContent() : this.textBody;
    navigator.clipboard.writeText(textToCopy).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
